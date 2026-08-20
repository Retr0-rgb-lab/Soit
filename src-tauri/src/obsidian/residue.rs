use super::{inquiry_dir, AppendResidueResult, RESIDUE_TEXT_MAX_CHARS};
use std::path::Path;

/// Local calendar date `YYYY-MM-DD` (not UTC-only).
pub fn today_ymd() -> String {
  let (y, m, d, _, _, _) = local_now_ymd_hms();
  format!("{y:04}-{m:02}-{d:02}")
}

/// Local clock time `HH:MM:SS`.
pub fn now_hms() -> String {
  let (_, _, _, h, mi, s) = local_now_ymd_hms();
  format!("{h:02}:{mi:02}:{s:02}")
}

fn local_now_ymd_hms() -> (i32, u32, u32, u32, u32, u32) {
  #[cfg(windows)]
  {
    #[repr(C)]
    struct SystemTime {
      w_year: u16,
      w_month: u16,
      w_day_of_week: u16,
      w_day: u16,
      w_hour: u16,
      w_minute: u16,
      w_second: u16,
      w_milliseconds: u16,
    }
    extern "system" {
      fn GetLocalTime(lp_system_time: *mut SystemTime);
    }
    let mut st = SystemTime {
      w_year: 0,
      w_month: 0,
      w_day_of_week: 0,
      w_day: 0,
      w_hour: 0,
      w_minute: 0,
      w_second: 0,
      w_milliseconds: 0,
    };
    unsafe { GetLocalTime(&mut st) };
    (
      st.w_year as i32,
      st.w_month as u32,
      st.w_day as u32,
      st.w_hour as u32,
      st.w_minute as u32,
      st.w_second as u32,
    )
  }
  #[cfg(unix)]
  {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_secs() as i64)
      .unwrap_or(0);
    // libc localtime_r
    extern "C" {
      fn localtime_r(timep: *const i64, result: *mut LibcTm) -> *mut LibcTm;
    }
    #[repr(C)]
    struct LibcTm {
      tm_sec: i32,
      tm_min: i32,
      tm_hour: i32,
      tm_mday: i32,
      tm_mon: i32,
      tm_year: i32,
      tm_wday: i32,
      tm_yday: i32,
      tm_isdst: i32,
      // platform padding / tm_gmtoff etc. — we only read the first fields
      _pad: [u8; 16],
    }
    let mut tm = LibcTm {
      tm_sec: 0,
      tm_min: 0,
      tm_hour: 0,
      tm_mday: 0,
      tm_mon: 0,
      tm_year: 0,
      tm_wday: 0,
      tm_yday: 0,
      tm_isdst: 0,
      _pad: [0; 16],
    };
    let t = secs;
    let ptr = unsafe { localtime_r(&t, &mut tm) };
    if ptr.is_null() {
      return civil_from_utc_days(secs);
    }
    (
      tm.tm_year + 1900,
      (tm.tm_mon + 1) as u32,
      tm.tm_mday as u32,
      tm.tm_hour as u32,
      tm.tm_min as u32,
      tm.tm_sec as u32,
    )
  }
  #[cfg(not(any(windows, unix)))]
  {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_secs() as i64)
      .unwrap_or(0);
    civil_from_utc_days(secs)
  }
}

/// Fallback civil date from UTC epoch seconds (date + hms).
#[allow(dead_code)]
fn civil_from_utc_days(secs: i64) -> (i32, u32, u32, u32, u32, u32) {
  let days = secs.div_euclid(86_400);
  let tod = secs.rem_euclid(86_400) as u32;
  let h = tod / 3600;
  let mi = (tod % 3600) / 60;
  let s = tod % 60;
  // Howard Hinnant civil-from-days
  let z = days + 719_468;
  let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
  let doe = (z - era * 146_097) as u64;
  let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
  let y = yoe as i64 + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = if m <= 2 { y + 1 } else { y };
  (y as i32, m as u32, d as u32, h, mi, s)
}

/// Append a short residue snippet under `inquiry/{date}-residue.md`.
pub fn write_residue(vault: &Path, card_id: &str, text: &str) -> AppendResidueResult {
  let text = text.trim();
  if card_id.trim().is_empty() {
    return AppendResidueResult {
      ok: false,
      path: None,
      error: Some("card_id required".into()),
    };
  }
  if text.is_empty() {
    return AppendResidueResult {
      ok: false,
      path: None,
      error: Some("text required".into()),
    };
  }
  if text.chars().count() > RESIDUE_TEXT_MAX_CHARS {
    return AppendResidueResult {
      ok: false,
      path: None,
      error: Some(format!(
        "text exceeds {RESIDUE_TEXT_MAX_CHARS} character limit"
      )),
    };
  }
  let dir = inquiry_dir(vault);
  if let Err(e) = std::fs::create_dir_all(&dir) {
    return AppendResidueResult {
      ok: false,
      path: None,
      error: Some(format!("create inquiry/: {e}")),
    };
  }
  let path = dir.join(format!("{}-residue.md", today_ymd()));
  let path_str = path.to_string_lossy().to_string();
  let snippet = format!("\n## {} · card `{card_id}`\n\n{text}\n", now_hms());
  let needs_header = !path.exists();
  let mut block = String::new();
  if needs_header {
    block.push_str(&format!(
      "---\nsoit_residue: true\n---\n\n# Residue · {}\n",
      today_ymd()
    ));
  }
  block.push_str(&snippet);

  use std::io::Write;
  let mut file = match std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&path)
  {
    Ok(f) => f,
    Err(e) => {
      return AppendResidueResult {
        ok: false,
        path: Some(path_str),
        error: Some(format!("open residue: {e}")),
      };
    }
  };
  if let Err(e) = file.write_all(block.as_bytes()) {
    return AppendResidueResult {
      ok: false,
      path: Some(path_str),
      error: Some(format!("append residue: {e}")),
    };
  }
  AppendResidueResult {
    ok: true,
    path: Some(path_str),
    error: None,
  }
}
