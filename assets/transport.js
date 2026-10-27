export async function request(route, payload = {}, options = {}) {
  const config = window.OSDA_CONFIG || {};
  if (!config.apiUrl)
    throw Error(
      "Ruang pengurus sedang dipersiapkan. Hubungi admin untuk informasi akses.",
    );
  const headers = {
    "Content-Type": "application/json",
    "X-OSDA-Request-ID": options.requestId || crypto.randomUUID(),
  };
  if (config.publishableKey) headers.apikey = config.publishableKey;
  let response;
  try {
    response = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ route, payload }),
      credentials: "omit",
      signal: AbortSignal.timeout(100000),
    });
  } catch {
    throw Error(
      "Koneksi terputus. Periksa data sebelum mengulangi penyimpanan.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("Layanan belum dapat dihubungi. Coba sesaat lagi.");
  }
  if (!response.ok || result.error) {
    const e = Error(result.error || "Permintaan belum berhasil.");
    e.code = result.code;
    throw e;
  }
  return result.data;
}
