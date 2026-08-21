//! URL safety for fetch_url (SSRF deny list).

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use url::Url;

pub fn validate_fetch_url(raw: &str, allow_loopback: bool) -> Result<Url, String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Err("url is empty".into());
  }
  if trimmed.len() > 2048 {
    return Err("url too long".into());
  }
  let url = Url::parse(trimmed).map_err(|e| format!("invalid url: {e}"))?;
  let scheme = url.scheme();
  if scheme != "http" && scheme != "https" {
    return Err(format!("scheme not allowed: {scheme}"));
  }
  let host = url
    .host_str()
    .ok_or_else(|| "url missing host".to_string())?
    .to_ascii_lowercase();

  if host == "localhost" || host.ends_with(".localhost") {
    if allow_loopback {
      return Ok(url);
    }
    return Err("loopback host blocked".into());
  }

  // Literal IP
  if let Ok(ip) = host.parse::<IpAddr>() {
    if is_blocked_ip(ip, allow_loopback) {
      return Err(format!("address blocked: {ip}"));
    }
    return Ok(url);
  }

  // Metadata / internal hostnames
  if host == "metadata.google.internal"
    || host.ends_with(".internal")
    || host == "kubernetes.default"
    || host == "kubernetes.default.svc"
  {
    return Err("internal host blocked".into());
  }

  Ok(url)
}

fn is_blocked_ip(ip: IpAddr, allow_loopback: bool) -> bool {
  match ip {
    IpAddr::V4(v4) => is_blocked_v4(v4, allow_loopback),
    IpAddr::V6(v6) => is_blocked_v6(v6, allow_loopback),
  }
}

fn is_blocked_v4(ip: Ipv4Addr, allow_loopback: bool) -> bool {
  if ip.is_loopback() || ip.is_unspecified() {
    return !allow_loopback;
  }
  if ip.is_link_local() || ip.is_broadcast() || ip.is_multicast() {
    return true;
  }
  // Private
  let o = ip.octets();
  if o[0] == 10 {
    return true;
  }
  if o[0] == 172 && (16..=31).contains(&o[1]) {
    return true;
  }
  if o[0] == 192 && o[1] == 168 {
    return true;
  }
  // CGNAT
  if o[0] == 100 && (64..=127).contains(&o[1]) {
    return true;
  }
  // Cloud metadata
  if o == [169, 254, 169, 254] {
    return true;
  }
  false
}

fn is_blocked_v6(ip: Ipv6Addr, allow_loopback: bool) -> bool {
  if ip.is_loopback() || ip.is_unspecified() {
    return !allow_loopback;
  }
  if ip.is_multicast() {
    return true;
  }
  // Unique local fc00::/7
  let s = ip.segments();
  if (s[0] & 0xfe00) == 0xfc00 {
    return true;
  }
  // Link-local fe80::/10
  if (s[0] & 0xffc0) == 0xfe80 {
    return true;
  }
  // IPv4-mapped
  if let Some(v4) = ip.to_ipv4_mapped() {
    return is_blocked_v4(v4, allow_loopback);
  }
  false
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn allows_public_https() {
    assert!(validate_fetch_url("https://example.com/a", false).is_ok());
  }

  #[test]
  fn blocks_private() {
    assert!(validate_fetch_url("http://192.168.1.1/", false).is_err());
    assert!(validate_fetch_url("http://10.0.0.2/", false).is_err());
    assert!(validate_fetch_url("http://172.16.0.1/", false).is_err());
  }

  #[test]
  fn blocks_metadata() {
    assert!(validate_fetch_url("http://169.254.169.254/latest", false).is_err());
  }

  #[test]
  fn loopback_gated() {
    assert!(validate_fetch_url("http://127.0.0.1:8080/", false).is_err());
    assert!(validate_fetch_url("http://127.0.0.1:8080/", true).is_ok());
    assert!(validate_fetch_url("http://localhost/", false).is_err());
  }

  #[test]
  fn blocks_file() {
    assert!(validate_fetch_url("file:///etc/passwd", false).is_err());
  }
}
