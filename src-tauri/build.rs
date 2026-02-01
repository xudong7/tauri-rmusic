use std::fs::{self, File};
use std::path::{Path, PathBuf};

#[cfg(unix)]
const SIDECAR_BASES: &[&str] = &["app_linux", "app_mac", "app_win"];
#[cfg(unix)]
const SIDECAR_MODE: u32 = 0o755;

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let zip_path = manifest_dir.join("binaries.zip");
    let binaries_dir = manifest_dir.join("binaries");

    if zip_path.exists() {
        if let Err(e) = extract_zip(&zip_path, &manifest_dir) {
            eprintln!("cargo:warning=Failed to extract binaries.zip (skip sidecar): {}", e);
        }
    }

    if binaries_dir.exists() {
        if let Err(e) = ensure_sidecar_with_target_triple(&binaries_dir) {
            panic!("Failed to prepare sidecar for Tauri: {}", e);
        }
        if let Err(e) = chmod_sidecars(&binaries_dir) {
            panic!("Failed to chmod sidecar binaries: {}", e);
        }
    }

    tauri_build::build();
}

fn extract_zip(zip_path: &Path, out_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        let outpath = out_dir.join(&name);

        if name.ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p)?;
            }
            let mut outfile = File::create(&outpath)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }
    Ok(())
}

/// Tauri 2 要求 sidecar 文件名为 `base-<TARGET_TRIPLE>`。将 zip 内的无后缀二进制复制为带 target triple 的文件供 Tauri 查找。
fn ensure_sidecar_with_target_triple(binaries_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let target = std::env::var("TARGET").map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "TARGET env not set")
    })?;

    let (base_name, ext) = {
        #[cfg(target_os = "linux")]
        { ("app_linux", "") }
        #[cfg(target_os = "macos")]
        { ("app_mac", "") }
        #[cfg(target_os = "windows")]
        { ("app_win", ".exe") }
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        return Ok(());
    };

    let src = binaries_dir.join(format!("{}{}", base_name, ext));
    let dst = binaries_dir.join(format!("{}-{}{}", base_name, target, ext));
    if src.exists() && !dst.exists() {
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
        for base in SIDECAR_BASES {
            for name in [base.to_string(), format!("{}-{}", base, target)] {
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
