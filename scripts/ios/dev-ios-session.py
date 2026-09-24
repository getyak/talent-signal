#!/usr/bin/env python3
"""Reusable macOS local iOS test session runner.

Resolves an allowlisted simulator, serializes participating test processes on
one machine-wide lock, and keeps device lifecycle responsibility with the
session that actually booted the device.

The file interface is intentionally small:

    dev-ios-session select [--profile primary|compact|ipad] [--udid UDID] [--reason TEXT]
    dev-ios-session run [selection] [--timeout SECONDS] -- COMMAND [ARG...]
    dev-ios-session is-owner [selection]

Only the Python standard library is used. The wrapper never creates, erases, or
deletes simulators, never boots a device itself, and never shuts down a device
it did not boot.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
import uuid

DEFAULT_PROFILE = "primary"
PROFILE_LABELS = {
    "primary": "Primary iPhone",
    "compact": "Compact iPhone",
    "ipad": "iPad",
}
DEFAULT_LOCK_FILE = "/tmp/ios-automation.xcodebuild.lock"
DEFAULT_LOCK_TIMEOUT_SECONDS = 600
SHLOCK = "/usr/bin/shlock"
SIGNAL_EXIT_CODES = {signal.SIGINT: 130, signal.SIGTERM: 143}
CHILD_SIGNAL_GRACE_SECONDS = 10.0
CLEANUP_FAILURE_EXIT_CODE = 70
SESSION_METADATA_SUFFIX = ".session.json"

USAGE = """usage:
  dev-ios-session select   [--profile primary|compact|ipad] [--udid UDID] [--reason TEXT]
  dev-ios-session run      [--profile primary|compact|ipad] [--udid UDID] [--reason TEXT]
                           [--timeout SECONDS] -- COMMAND [ARG...]
  dev-ios-session is-owner [--profile primary|compact|ipad] [--udid UDID] [--reason TEXT]"""


class SessionError(Exception):
    """A user-facing session failure with an explicit process exit code."""

    def __init__(self, message: str, code: int = 2) -> None:
        super().__init__(message)
        self.code = code


class SessionInterrupted(Exception):
    """Raised when a session-owner signal arrives outside the child window."""

    def __init__(self, signum: int) -> None:
        super().__init__(f"interrupted by signal {signum}")
        self.signum = signum


def die(message: str, code: int = 2) -> "SessionError":
    raise SessionError(message, code)


def log(message: str) -> None:
    print(message, file=sys.stderr)


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------


def parse_cli(argv):
    if argv and argv[0] in ("-h", "--help", "help"):
        print(USAGE)
        raise SessionError("", 0)
    if not argv:
        die(f"Missing command\n{USAGE}", 64)
    command = argv[0]
    if command not in ("select", "run", "is-owner"):
        die(f"Unknown command: {command}\n{USAGE}", 64)
    rest = argv[1:]
    command_args = []
    if command == "run":
        if "--" not in rest:
            die(f"run requires an explicit command after '--'\n{USAGE}", 64)
        separator = rest.index("--")
        option_args = rest[:separator]
        command_args = rest[separator + 1 :]
        if not command_args:
            die("run requires a command after '--'", 64)
    else:
        option_args = rest

    options = {"profile": None, "udid": None, "reason": None, "timeout": None}
    index = 0
    while index < len(option_args):
        token = option_args[index]
        name, has_inline, inline = token.partition("=")
        if name not in ("--profile", "--udid", "--reason", "--timeout"):
            die(f"Unknown option: {token}\n{USAGE}", 64)
        if has_inline:
            value = inline
        else:
            index += 1
            if index >= len(option_args):
                die(f"{name} requires a value", 64)
            value = option_args[index]
        options[name[2:]] = value
        index += 1

    if command != "run" and options["timeout"] is not None:
        die("--timeout is only valid for run", 64)
    return command, options, command_args


# ---------------------------------------------------------------------------
# Allowlist and simulator selection
# ---------------------------------------------------------------------------


def allowlist_path() -> str:
    override = os.environ.get("DEV_IOS_ALLOWLIST")
    if override:
        return override
    home = os.path.expanduser("~")
    return os.path.join(home, ".config", "dev-storage-guard", "simulator-allowlist.tsv")


def lock_file_path() -> str:
    return os.environ.get("IOS_AUTOMATION_LOCK_FILE") or DEFAULT_LOCK_FILE


def session_metadata_path(lock_path: str) -> str:
    return lock_path + SESSION_METADATA_SUFFIX


def parse_allowlist(path: str):
    if not os.path.isfile(path):
        die(f"Simulator allowlist not found: {path}", 2)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.readlines()
    except OSError as error:
        die(f"Cannot read simulator allowlist {path}: {error}", 2)

    by_label = {}
    by_udid = {}
    for number, raw in enumerate(lines, 1):
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) != 2:
            die(f"Malformed simulator allowlist entry at {path}:{number}", 2)
        udid = fields[0].strip()
        label = fields[1].strip()
        if not udid or not label:
            die(f"Malformed simulator allowlist entry at {path}:{number}", 2)
        if label in by_label:
            die(f"Duplicate simulator allowlist label {label!r} in {path}", 2)
        if udid in by_udid:
            die(f"Duplicate simulator allowlist device {udid} in {path}", 2)
        by_label[label] = udid
        by_udid[udid] = label
    if not by_label:
        die(f"Simulator allowlist is empty: {path}", 2)
    return by_label


def load_available_devices():
    try:
        completed = subprocess.run(
            ["xcrun", "simctl", "list", "devices", "available", "-j"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except OSError as error:
        die(f"Unable to run xcrun simctl: {error}", 2)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or "unknown error"
        die(f"xcrun simctl list devices available -j failed: {detail}", 2)
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        die(f"xcrun simctl returned invalid JSON: {error}", 2)
    if not isinstance(payload, dict):
        die("xcrun simctl returned an unexpected JSON shape: the root is not an object.", 2)
    raw_devices = payload.get("devices")
    if not isinstance(raw_devices, dict):
        die("xcrun simctl returned an unexpected JSON shape: missing the devices map.", 2)

    devices = {}
    for runtime, entries in raw_devices.items():
        if not isinstance(runtime, str) or not isinstance(entries, list):
            die("xcrun simctl returned an unexpected JSON shape: runtime entries are not a list.", 2)
        for device in entries:
            if not isinstance(device, dict):
                die("xcrun simctl returned an unexpected JSON shape: a device is not an object.", 2)
            udid = device.get("udid")
            name = device.get("name")
            state = device.get("state")
            if not isinstance(udid, str) or not udid:
                die("xcrun simctl returned an unexpected JSON shape: a device udid is missing.", 2)
            if not isinstance(name, str):
                die(f"xcrun simctl returned an unexpected JSON shape: device {udid} name is missing.", 2)
            if not isinstance(state, str):
                die(f"xcrun simctl returned an unexpected JSON shape: device {udid} state is missing.", 2)
            devices[udid] = {
                "name": name,
                "state": state,
                "is_available": device.get("isAvailable") is True,
                "runtime": runtime,
            }
    return devices


def expected_kind(profile: str) -> str:
    return "iPad" if profile == "ipad" else "iPhone"


def device_kind(name: str):
    if name.startswith("iPad"):
        return "iPad"
    if name.startswith("iPhone"):
        return "iPhone"
    return None


def resolve_selection(profile, udid, reason):
    profile = profile or os.environ.get("DEV_IOS_PROFILE") or DEFAULT_PROFILE
    if profile not in PROFILE_LABELS:
        allowed = ", ".join(sorted(PROFILE_LABELS))
        die(f"Unknown iOS session profile {profile!r}; expected one of {allowed}", 2)

    explicit_udid = (udid if udid is not None else os.environ.get("IOS_SIMULATOR_ID", "")) or ""
    explicit_udid = explicit_udid.strip()
    selected_reason = reason if reason is not None else os.environ.get("DEV_IOS_REASON", "")
    selected_reason = (selected_reason or "").strip()

    labels = parse_allowlist(allowlist_path())
    label = PROFILE_LABELS[profile]
    if label not in labels:
        die(f"Simulator allowlist has no entry labelled {label!r} for profile {profile!r}", 2)
    configured_udid = labels[label]

    if explicit_udid and explicit_udid != configured_udid:
        die(
            f"Unexpected device mismatch: profile {profile!r} selects allowlisted "
            f"{label} ({configured_udid}) but --udid/IOS_SIMULATOR_ID requested {explicit_udid}",
            2,
        )
    if profile != DEFAULT_PROFILE and not selected_reason:
        die(
            f"Profile {profile!r} selects a secondary simulator and requires a nonempty "
            f"--reason or DEV_IOS_REASON",
            2,
        )

    selected_udid = explicit_udid or configured_udid
    devices = load_available_devices()
    device = devices.get(selected_udid)
    if device is None:
        die(f"Selected simulator {selected_udid} ({label}) is not available on an iOS runtime", 2)
    if not device["is_available"] or "iOS" not in device["runtime"]:
        die(f"Selected simulator {selected_udid} ({label}) is not available on an iOS runtime", 2)
    kind = device_kind(device["name"])
    if kind != expected_kind(profile):
        die(
            f"Unexpected device mismatch: profile {profile!r} expected an "
            f"{expected_kind(profile)} but {selected_udid} is {device['name']!r}",
            2,
        )
    return {
        "profile": profile,
        "label": label,
        "udid": selected_udid,
        "name": device["name"],
        "state": device["state"],
        "reason": selected_reason,
    }


# ---------------------------------------------------------------------------
# Process inspection
# ---------------------------------------------------------------------------


def read_ppid(pid: int):
    try:
        completed = subprocess.run(
            ["ps", "-o", "ppid=", "-p", str(pid)],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=False,
        )
    except OSError:
        return None
    value = completed.stdout.strip()
    if not value.isdigit():
        return None
    return int(value)


def ancestor_chain(pid: int):
    chain = []
    seen = set()
    current = pid
    while current and current not in seen:
        seen.add(current)
        parent = read_ppid(current)
        if parent is None or parent <= 1:
            break
        chain.append(parent)
        current = parent
    return chain


def process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def process_group_members(pgid: int):
    """Return live (non-zombie) pids in pgid; never includes this process."""
    try:
        completed = subprocess.run(
            ["ps", "-axo", "pid=,pgid=,stat="],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=False,
        )
    except OSError as error:
        raise SessionError(f"Cannot inspect process group {pgid}: {error}") from error
    if completed.returncode != 0:
        raise SessionError(f"Cannot inspect process group {pgid}: ps exited {completed.returncode}")
    members = []
    for line in completed.stdout.splitlines():
        fields = line.split()
        if not fields:
            continue
        if len(fields) != 3:
            raise SessionError(f"Cannot inspect process group {pgid}: malformed ps output")
        pid_token, pgid_token, stat = fields[0], fields[1], fields[2]
        if not pid_token.isdigit() or not pgid_token.isdigit():
            raise SessionError(f"Cannot inspect process group {pgid}: invalid process identifiers")
        if int(pgid_token) != pgid:
            continue
        # Zombies still belong to the group until reaped; do not treat them as
        # live work, and never signal signals at them.
        if stat.startswith("Z"):
            continue
        pid = int(pid_token)
        if pid == os.getpid():
            continue
        members.append(pid)
    return members


def signal_process_group(pgid: int, signum: int) -> None:
    try:
        os.killpg(pgid, signum)
    except (ProcessLookupError, PermissionError):
        pass


def read_lock_owner(lock_path: str):
    try:
        with open(lock_path, "r", encoding="utf-8") as handle:
            return handle.readline().strip()
    except OSError:
        return None


# ---------------------------------------------------------------------------
# Owned-session metadata
# ---------------------------------------------------------------------------


def load_session_metadata(lock_path: str):
    """Return metadata for an owned session, or None when it is absent/invalid."""
    try:
        with open(session_metadata_path(lock_path), "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def write_session_metadata(lock_path: str, metadata) -> None:
    path = session_metadata_path(lock_path)
    temporary = f"{path}.tmp.{os.getpid()}"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, sort_keys=True)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def load_owned_session(lock_path: str):
    """Return (owner_pid, metadata) for a genuine, live, owned session.

    Requires the inherited environment to agree with the immutable metadata
    record and the real lock holder, and requires the owner to be a living
    ancestor of this process. A copied environment alone never qualifies.
    """
    if os.environ.get("IOS_AUTOMATION_LOCK_HELD") != "true":
        return None
    raw = (os.environ.get("DEV_IOS_SESSION_PID") or "").strip()
    if not raw.isdigit():
        return None
    owner = int(raw)
    if owner <= 1 or owner == os.getpid():
        return None
    if owner not in ancestor_chain(os.getpid()):
        return None
    if not process_alive(owner):
        return None
    if read_lock_owner(lock_path) != str(owner):
        return None
    metadata = load_session_metadata(lock_path)
    if not metadata or metadata.get("pid") != owner:
        return None
    if metadata.get("lock_file") != lock_path:
        return None
    session_id = (os.environ.get("DEV_IOS_SESSION_ID") or "").strip()
    if not session_id or metadata.get("session_id") != session_id:
        return None
    return owner, metadata


def session_is_claimed() -> bool:
    return bool(
        os.environ.get("IOS_AUTOMATION_LOCK_HELD") == "true"
        or (os.environ.get("DEV_IOS_SESSION_PID") or "").strip()
        or (os.environ.get("DEV_IOS_SESSION_ID") or "").strip()
    )


def session_environment(lock_path, selection, owner_pid, session_id, borrowed):
    return {
        "IOS_SIMULATOR_ID": selection["udid"],
        "SIMULATOR_UDID": selection["udid"],
        "DEV_IOS_PROFILE": selection["profile"],
        "DEV_IOS_REASON": selection["reason"],
        "DEV_IOS_SESSION_PID": str(owner_pid),
        "DEV_IOS_SESSION_ID": session_id,
        "DEV_IOS_BORROWED": "true" if borrowed else "false",
        "IOS_AUTOMATION_LOCK_FILE": lock_path,
        "IOS_AUTOMATION_LOCK_HELD": "true",
    }


# ---------------------------------------------------------------------------
# Machine-wide lock
# ---------------------------------------------------------------------------


class SessionSignals:
    """Forward owner signals to the active child and remember the interruption."""

    def __init__(self) -> None:
        self.signum = None
        self.child = None
        self.term_deadline = None
        self.kill_sent = False
        self._previous = {}

    def install(self) -> None:
        for sig in (signal.SIGINT, signal.SIGTERM):
            self._previous[sig] = signal.signal(sig, self.handle)

    def restore(self) -> None:
        for sig, handler in self._previous.items():
            signal.signal(sig, handler)
        self._previous = {}

    def handle(self, signum, _frame) -> None:
        if self.signum is None:
            self.signum = signum
        if self.child is not None:
            self.forward(signum)

    def forward(self, signum: int) -> None:
        if self.term_deadline is None:
            self.term_deadline = time.monotonic() + CHILD_SIGNAL_GRACE_SECONDS
        child = self.child
        try:
            os.killpg(child.pid, signum)
        except (ProcessLookupError, PermissionError):
            pass


def acquire_lock(lock_path: str, timeout_seconds: int, signals: SessionSignals) -> None:
    deadline = time.monotonic() + max(0, timeout_seconds)
    reported = False
    while True:
        if signals.signum is not None:
            raise SessionInterrupted(signals.signum)
        try:
            completed = subprocess.run(
                [SHLOCK, "-f", lock_path, "-p", str(os.getpid())],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        except OSError as error:
            die(f"Unable to run shlock ({SHLOCK}): {error}", 2)
        if completed.returncode == 0:
            break
        if not reported:
            owner = read_lock_owner(lock_path) or "unknown"
            log(f"Waiting for the machine-wide iOS automation lock (owner pid {owner})...")
            reported = True
        if time.monotonic() >= deadline:
            die(f"Timed out waiting for the machine-wide iOS automation lock at {lock_path}", 75)
        time.sleep(0.2)
    if read_lock_owner(lock_path) != str(os.getpid()):
        die(f"Machine-wide iOS automation lock at {lock_path} is not owned by this process", 75)


def release_lock(lock_path: str) -> None:
    if read_lock_owner(lock_path) != str(os.getpid()):
        return
    metadata = load_session_metadata(lock_path)
    # Remove our metadata while still excluding the next owner. Unlinking the
    # lock first would let a successor publish metadata that we then delete.
    if metadata and metadata.get("pid") == os.getpid():
        try:
            os.unlink(session_metadata_path(lock_path))
        except OSError:
            pass
    if read_lock_owner(lock_path) == str(os.getpid()):
        try:
            os.unlink(lock_path)
        except OSError:
            pass


def ensure_no_other_booted(devices, selected_udid: str) -> None:
    active = [
        f"{info['name']} ({udid}, {info['state']})"
        for udid, info in devices.items()
        if udid != selected_udid and info["state"] != "Shutdown"
    ]
    if active:
        die(
            "Refusing to start an iOS session while other simulators are active: "
            + ", ".join(sorted(active))
            + ". Shut them down yourself; this session never shuts down devices it does not own.",
            2,
        )


def unrelated_xcodebuild_processes(owner_pid: int):
    try:
        completed = subprocess.run(
            ["pgrep", "-x", "xcodebuild"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=False,
        )
    except OSError:
        return []
    if completed.returncode not in (0, 1):
        return []
    related = set(ancestor_chain(os.getpid()))
    related.add(owner_pid)
    unrelated = []
    for token in completed.stdout.split():
        if not token.isdigit():
            continue
        pid = int(token)
        if pid == os.getpid() or pid in related:
            continue
        if owner_pid in ancestor_chain(pid):
            continue
        unrelated.append(pid)
    return unrelated


def ensure_no_unrelated_xcodebuild(owner_pid: int) -> None:
    unrelated = unrelated_xcodebuild_processes(owner_pid)
    if unrelated:
        die(
            "Refusing to start an iOS session while unrelated xcodebuild processes are running: "
            + ", ".join(str(pid) for pid in unrelated)
            + ". Wait for them to finish; this session never kills them.",
            2,
        )


# ---------------------------------------------------------------------------
# Child process lifecycle
# ---------------------------------------------------------------------------


def teardown_process_group(pgid: int) -> None:
    """Escalate within a bounded time; release only after confirmed group exit."""
    term_deadline = time.monotonic() + CHILD_SIGNAL_GRACE_SECONDS
    kill_deadline = None
    stalled_reported = False
    while True:
        try:
            members = process_group_members(pgid)
        except SessionError as error:
            members = None
            if not stalled_reported:
                log(f"Holding the iOS session lock until process teardown can be verified: {error}")
                stalled_reported = True
        if members == []:
            return
        now = time.monotonic()
        if kill_deadline is None:
            if now >= term_deadline:
                signal_process_group(pgid, signal.SIGKILL)
                kill_deadline = now + CHILD_SIGNAL_GRACE_SECONDS
            else:
                signal_process_group(pgid, signal.SIGTERM)
        elif now >= kill_deadline:
            if not stalled_reported:
                log(f"Holding the iOS session lock: process group {pgid} remains active after SIGKILL.")
                stalled_reported = True
            # An uninterruptible process is still live work. Stay alive with
            # the lock held until a successful inventory proves it has exited.
        time.sleep(0.1)


def run_child(command, child_env, signals: SessionSignals) -> int:
    try:
        child = subprocess.Popen(command, env=child_env, start_new_session=True)
    except OSError as error:
        die(f"Unable to start session command {command[0]!r}: {error}", 127)

    signals.child = child
    pgid = child.pid  # start_new_session makes the child its own process group leader
    try:
        if signals.signum is not None:
            signals.forward(signals.signum)
        returncode = None
        while True:
            try:
                returncode = child.wait(timeout=0.2)
                break
            except subprocess.TimeoutExpired:
                if (
                    signals.signum is not None
                    and not signals.kill_sent
                    and signals.term_deadline is not None
                    and time.monotonic() >= signals.term_deadline
                ):
                    signal_process_group(pgid, signal.SIGKILL)
                    signals.kill_sent = True
        # Keep the session (and therefore the lock) owned until background
        # descendants are gone, including after a normal leader exit.
        teardown_process_group(pgid)
    finally:
        signals.child = None

    if signals.signum is not None:
        return SIGNAL_EXIT_CODES.get(signals.signum, 128 + signals.signum)
    if returncode is not None and returncode < 0:
        return 128 - returncode
    return returncode


def closeout_device(selection, borrowed):
    """Return an actionable cleanup error string, or None when clean."""
    if selection is None or borrowed is None:
        return None
    udid = selection["udid"]
    if borrowed:
        log(
            f"Borrowed-device warning: leaving {selection['name']} ({udid}) running because it "
            "was already active before this session."
        )
        return None
    try:
        devices = load_available_devices()
    except SessionError as error:
        return f"could not verify simulator state for {udid}: {error}"
    device = devices.get(udid)
    if device is None:
        return f"selected simulator {udid} is missing from the available device inventory at closeout"
    if device["state"] == "Shutdown":
        return None
    log(f"Shutting down {device['name']} ({udid}) because this session booted it.")
    try:
        completed = subprocess.run(
            ["xcrun", "simctl", "shutdown", udid],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except OSError as error:
        return f"failed to run simctl shutdown {udid}: {error}"
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        return f"simctl shutdown {udid} failed: {detail}"
    try:
        readback = load_available_devices()
    except SessionError as error:
        return f"could not read back simulator state for {udid}: {error}"
    readback_device = readback.get(udid)
    if readback_device is None:
        return f"simctl shutdown {udid} readback could not find the selected simulator"
    if readback_device["state"] != "Shutdown":
        return f"simctl shutdown {udid} did not take effect; device is {readback_device['state']}"
    return None


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def command_select(options) -> int:
    selection = resolve_selection(options["profile"], options["udid"], options["reason"])
    print(selection["udid"])
    return 0


def command_is_owner(options) -> int:
    owned = load_owned_session(lock_file_path())
    if owned is None:
        print("false")
        return 1
    _owner, metadata = owned
    try:
        selection = resolve_selection(options["profile"], options["udid"], options["reason"])
    except SessionError:
        print("false")
        return 1
    if selection["udid"] != metadata.get("udid") or selection["profile"] != metadata.get("profile"):
        print("false")
        return 1
    print("true")
    return 0


def command_run(options, command) -> int:
    timeout = DEFAULT_LOCK_TIMEOUT_SECONDS
    if options["timeout"] is not None:
        try:
            timeout = int(options["timeout"])
        except ValueError:
            die(f"--timeout must be an integer number of seconds: {options['timeout']!r}", 64)
        if timeout < 0:
            die("--timeout must not be negative", 64)

    path = lock_file_path()
    signals = SessionSignals()
    signals.install()
    acquired = False
    selection = None
    borrowed = None
    child_rc = None
    cleanup_error = None
    interrupted = None
    try:
        try:
            selection = resolve_selection(options["profile"], options["udid"], options["reason"])
            owned = load_owned_session(path)
            if owned is not None:
                owner, metadata = owned
                if (
                    selection["udid"] != metadata.get("udid")
                    or selection["profile"] != metadata.get("profile")
                ):
                    die(
                        "Refusing nested iOS session: requested "
                        f"{selection['profile']}/{selection['udid']} does not match the active "
                        f"session {metadata.get('profile')}/{metadata.get('udid')}.",
                        2,
                    )
                borrowed = bool(metadata.get("borrowed"))
                log(
                    f"Joining the active iOS session owned by pid {owner} on "
                    f"{selection['name']} ({selection['udid']})."
                )
                child_env = dict(os.environ)
                child_env.update(
                    session_environment(path, selection, owner, metadata.get("session_id"), borrowed)
                )
                child_rc = run_child(command, child_env, signals)
            elif session_is_claimed():
                die(
                    "Refusing to start: inherited iOS session metadata is missing or inconsistent. "
                    "Start a new session instead of reusing a stale session environment.",
                    2,
                )
            else:
                acquire_lock(path, timeout, signals)
                acquired = True
                metadata = {
                    "pid": os.getpid(),
                    "lock_file": path,
                    "udid": selection["udid"],
                    "profile": selection["profile"],
                    "reason": selection["reason"],
                    "session_id": uuid.uuid4().hex,
                    "borrowed": None,
                }
                write_session_metadata(path, metadata)
                if signals.signum is not None:
                    raise SessionInterrupted(signals.signum)
                devices = load_available_devices()
                ensure_no_other_booted(devices, selection["udid"])
                ensure_no_unrelated_xcodebuild(os.getpid())
                device = devices.get(selection["udid"])
                if device is None:
                    die(
                        f"Selected simulator {selection['udid']} disappeared while acquiring the lock",
                        2,
                    )
                borrowed = device["state"] != "Shutdown"
                metadata["borrowed"] = borrowed
                write_session_metadata(path, metadata)
                if borrowed:
                    log(
                        f"Borrowed-device warning: {device['name']} ({selection['udid']}) was already "
                        f"{device['state']} before this session and will be left as-is at closeout."
                    )
                if signals.signum is not None:
                    raise SessionInterrupted(signals.signum)
                child_env = dict(os.environ)
                child_env.update(
                    session_environment(path, selection, os.getpid(), metadata["session_id"], borrowed)
                )
                child_rc = run_child(command, child_env, signals)
        except SessionInterrupted as caught:
            interrupted = caught.signum
        finally:
            if acquired:
                try:
                    cleanup_error = closeout_device(selection, borrowed)
                finally:
                    release_lock(path)
    finally:
        signals.restore()

    result = 128 + interrupted if interrupted is not None else (child_rc if child_rc is not None else 0)
    if cleanup_error is not None:
        log(f"iOS session cleanup failed: {cleanup_error}")
        if result == 0:
            result = CLEANUP_FAILURE_EXIT_CODE
    return result


def main(argv) -> int:
    try:
        command, options, command_args = parse_cli(argv)
        if command == "select":
            return command_select(options)
        if command == "is-owner":
            return command_is_owner(options)
        return command_run(options, command_args)
    except SessionInterrupted as interruption:
        return 128 + interruption.signum
    except SessionError as error:
        if str(error):
            print(str(error), file=sys.stderr)
        return error.code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
