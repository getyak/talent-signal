fn main() {
    use sha2::{Digest, Sha256};
    use std::{env, fs, path::PathBuf, process::Command};

    let target = env::var("TARGET").expect("Cargo TARGET");
    let helper = format!("binaries/talent-signal-vision-{target}");
    println!("cargo:rerun-if-changed={helper}");
    let unsigned = PathBuf::from(env::var("OUT_DIR").expect("Cargo OUT_DIR"))
        .join("talent-signal-vision-unsigned");
    fs::copy(&helper, &unsigned).expect("copy Vision helper for stable hashing");
    let status = Command::new("/usr/bin/codesign")
        .arg("--remove-signature")
        .arg(&unsigned)
        .status()
        .expect("remove copied Vision helper signature");
    assert!(
        status.success(),
        "Vision helper signature must be removable"
    );
    let digest = format!(
        "{:x}",
        Sha256::digest(fs::read(&unsigned).expect("read unsigned Vision helper"))
    );
    println!("cargo:rustc-env=TALENT_SIGNAL_VISION_UNSIGNED_SHA256={digest}");

    const COMMANDS: &[&str] = &[
        "activate_session_binding",
        "session_binding_status",
        "disconnect_session_binding",
        "desktop_capabilities",
        "capture_selected_window",
        "cancel_capture",
        "recognize_local_text",
        "cancel_ocr",
        "open_quick_panel",
        "notify_state",
    ];
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));
    tauri_build::try_build(attributes).expect("generate the bounded application ACL");
}
