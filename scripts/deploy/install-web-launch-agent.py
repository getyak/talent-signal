#!/usr/bin/env python3
"""Activate a prebuilt, committed Web release with launchd and rollback on failure."""
import json
import fcntl
import os
from pathlib import Path
import plistlib
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request


def run(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True)


def bootstrap(domain, plist, target, check=True):
    # bootout can return before launchd finishes removing the old registration.
    # Retry only the transient EIO while this exact job is still absent.
    for attempt in range(5):
        result = run("launchctl", "bootstrap", domain, str(plist), check=False)
        if result.returncode != 5 or run("launchctl", "print", target, check=False).returncode == 0:
            break
        if attempt < 4:
            time.sleep(1)
    if check:
        result.check_returncode()
    return result


def bootout(target, check=True):
    result = run("launchctl", "bootout", target, check=check)
    # A job can remain registered in its terminating state after bootout returns.
    for _ in range(120):
        if run("launchctl", "print", target, check=False).returncode != 0:
            return result
        time.sleep(0.25)
    raise RuntimeError("Previous Web job did not finish unloading; refusing activation")


def listeners_belong_to(target):
    listeners = run("lsof", "-nP", "-t", "-iTCP:3000", "-sTCP:LISTEN", check=False).stdout.split()
    job = run("launchctl", "print", target, check=False)
    match = re.search(r"^\s*pid = (\d+)\s*$", job.stdout, re.MULTILINE)
    if not listeners or not match:
        return False
    owner = match.group(1)
    for listener in set(listeners):
        seen = set()
        while listener != owner:
            if listener in seen or listener in ("", "0", "1"):
                return False
            seen.add(listener)
            listener = run("ps", "-o", "ppid=", "-p", listener, check=False).stdout.strip()
    return True


def main():
    if sys.platform != "darwin" or len(sys.argv) != 2:
        raise SystemExit("Usage on macOS: install-web-launch-agent.py BUILT_RELEASE_ROOT")
    release = Path(sys.argv[1]).resolve(strict=True)
    if not (release / "apps/web/.next/BUILD_ID").is_file():
        raise SystemExit("Build the release before activation")
    if run("git", "-C", str(release), "status", "--porcelain").stdout:
        raise SystemExit("Use a clean committed release before activation")
    revision = run("git", "-C", str(release), "rev-parse", "HEAD").stdout.strip()
    receipt = json.loads((release / "apps/web/.next/talent-signal-release.json").read_text())
    build_id = (release / "apps/web/.next/BUILD_ID").read_text().strip()
    if receipt != {"revision": revision, "buildID": build_id}:
        raise SystemExit("Build receipt does not match the source revision and production build")
    home = Path.home()
    state = home / "Library/Application Support/Talent Signal/web"
    logs = home / "Library/Logs/Talent Signal/web"
    agents = home / "Library/LaunchAgents"
    for directory in (state, logs, agents):
        directory.mkdir(parents=True, exist_ok=True)
    state.chmod(0o700)
    logs.chmod(0o700)
    lock = (state / "install.lock").open("a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    current = state / "current"
    if current.exists() and not current.is_symlink():
        raise SystemExit("Refusing to replace a non-symlink current release")
    label = "com.talentsignal.web"
    domain = f"gui/{os.getuid()}"
    target = f"{domain}/{label}"
    plist = agents / f"{label}.plist"
    loaded = run("launchctl", "print", target, check=False).returncode == 0
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", 3000)) == 0:
            if not loaded or not listeners_belong_to(target):
                raise SystemExit("Port 3000 belongs to another process; leave it running")
    old_release = os.readlink(current) if current.is_symlink() else None
    old_plist = plist.read_bytes() if plist.exists() else None
    binary_dirs = [str(Path(shutil.which(name) or name).resolve().parent)
                   for name in ("node", "pnpm", "infisical")]
    path = ":".join(dict.fromkeys(binary_dirs + [str(home / ".local/bin"),
                     "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]))
    config = {
        "Label": label,
        "ProgramArguments": [str(current / "scripts/deploy/web-local.sh"), "start"],
        "WorkingDirectory": str(current),
        "EnvironmentVariables": {"PATH": path},
        "RunAtLoad": True, "KeepAlive": True, "ThrottleInterval": 10,
        "StandardOutPath": str(logs / "stdout.log"),
        "StandardErrorPath": str(logs / "stderr.log"),
    }
    temporary = state / f"current-{os.getpid()}"
    try:
        if loaded:
            bootout(target)
        temporary.symlink_to(release, target_is_directory=True)
        temporary.replace(current)
        plist.write_bytes(plistlib.dumps(config))
        plist.chmod(0o600)
        bootstrap(domain, plist, target)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for _ in range(45):
            try:
                with opener.open("http://127.0.0.1:3000/api/auth/providers", timeout=2) as response:
                    providers = json.load(response)
                    if response.status == 200 and "password-account" in providers and listeners_belong_to(target):
                        (state / "active-release.json").write_text(json.dumps({
                            "revision": revision, "buildID": build_id,
                            "release": str(release), "port": 3000,
                        }, indent=2) + "\n")
                        print(f"Resident Web ready on port 3000 at revision {revision}")
                        return
            except (OSError, ValueError):
                pass
            time.sleep(1)
        raise RuntimeError("Web authentication readiness failed; inspect the launchd logs")
    except BaseException:
        bootout(target, check=False)
        current.unlink(missing_ok=True)
        if old_release:
            current.symlink_to(old_release, target_is_directory=True)
        if old_plist is not None:
            plist.write_bytes(old_plist)
            if loaded:
                bootstrap(domain, plist, target, check=False)
        else:
            plist.unlink(missing_ok=True)
        raise
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
