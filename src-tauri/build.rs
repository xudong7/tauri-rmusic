use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
#[cfg(unix)]
const SIDECAR_MODE: u32 = 0o755;

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let zip_path = manifest_dir.join("binaries.zip");
    let binaries_dir = manifest_dir.join("binaries");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={}", zip_path.display());

    let mut source_changed = false;
    if zip_path.exists() {
        match ensure_current_sidecar(&zip_path, &binaries_dir) {
            Ok(changed) => source_changed = changed,
            Err(e) => {
                eprintln!(
                    "cargo:warning=Failed to extract current sidecar from binaries.zip: {}",
                    e
                );
            }
        }
    }

    if binaries_dir.exists() {
        if let Err(e) = ensure_sidecar_with_target_triple(&binaries_dir, source_changed) {
            panic!("Failed to prepare sidecar for Tauri: {}", e);
        }
        if let Err(e) = chmod_sidecars(&binaries_dir) {
            panic!("Failed to chmod sidecar binaries: {}", e);
        }
    }

    tauri_build::build();
}

fn current_sidecar() -> Option<(&'static str, &'static str)> {
    #[cfg(target_os = "linux")]
    return Some(("app_linux", ""));
    #[cfg(target_os = "macos")]
    return Some(("app_mac", ""));
    #[cfg(target_os = "windows")]
    return Some(("app_win", ".exe"));
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    return None;
}

fn zip_fingerprint(zip_path: &Path) -> Result<String, Box<dyn std::error::Error>> {
    let metadata = fs::metadata(zip_path)?;
    let modified = metadata.modified()?.duration_since(std::time::UNIX_EPOCH)?;
    Ok(format!(
        "{}:{}:{}",
        metadata.len(),
        modified.as_secs(),
        modified.subsec_nanos()
    ))
}

fn ensure_current_sidecar(
    zip_path: &Path,
    binaries_dir: &Path,
) -> Result<bool, Box<dyn std::error::Error>> {
    let Some((base_name, ext)) = current_sidecar() else {
        return Ok(false);
    };
    fs::create_dir_all(binaries_dir)?;

    let source_name = format!("{}{}", base_name, ext);
    let source_path = binaries_dir.join(&source_name);
    let marker_path = binaries_dir.join(format!(".{}.zip-source", source_name));
    let fingerprint = zip_fingerprint(zip_path)?;
    if source_path.exists()
        && fs::read_to_string(&marker_path)
            .map(|stored| stored == fingerprint)
            .unwrap_or(false)
    {
        return Ok(false);
    }

    let file = File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let expected_entry = format!("binaries/{}", source_name);
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        if entry.name() != expected_entry {
            continue;
        }

        let temporary_path = binaries_dir.join(format!(".{}.extracting", source_name));
        let mut outfile = File::create(&temporary_path)?;
        io::copy(&mut entry, &mut outfile)?;
        drop(outfile);
        if source_path.exists() {
            fs::remove_file(&source_path)?;
        }
        fs::rename(&temporary_path, &source_path)?;
        fs::write(marker_path, fingerprint)?;
        return Ok(true);
    }

    Err(format!("{} not found in {}", expected_entry, zip_path.display()).into())
}

/// Tauri 2 要求 sidecar 文件名为 `base-<TARGET_TRIPLE>`。将 zip 内的无后缀二进制复制为带 target triple 的文件供 Tauri 查找。
fn ensure_sidecar_with_target_triple(
    binaries_dir: &Path,
    source_changed: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let target = std::env::var("TARGET")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::NotFound, "TARGET env not set"))?;

    let Some((base_name, ext)) = current_sidecar() else {
        return Ok(());
    };

    let src = binaries_dir.join(format!("{}{}", base_name, ext));
    let dst = binaries_dir.join(format!("{}-{}{}", base_name, target, ext));
    if src.exists() && (source_changed || !dst.exists()) {
        fs::copy(&src, &dst).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("copy {} -> {}: {}", src.display(), dst.display(), e),
            )
        })?;
    }
    Ok(())
}

/// 对 binaries 目录下的 sidecar 可执行文件加可执行位（无后缀与带 target triple 后缀的文件均处理）。
fn chmod_sidecars(_binaries_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let target = std::env::var("TARGET").unwrap_or_default();
        if let Some((base, ext)) = current_sidecar() {
            for name in [
                format!("{}{}", base, ext),
                format!("{}-{}{}", base, target, ext),
            ] {
                let path = _binaries_dir.join(&name);
                if path.exists() {
                    let mut perms = fs::metadata(&path)?.permissions();
                    perms.set_mode(SIDECAR_MODE);
                    fs::set_permissions(&path, perms)?;
                }
            }
        }
    }
    Ok(())
}
