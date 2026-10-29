import { request } from "./transport.js";
function runner(success, failure) {
  return new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "withSuccessHandler") return (fn) => runner(fn, failure);
        if (name === "withFailureHandler") return (fn) => runner(success, fn);
        if (!["rpc", "auth"].includes(name))
          return () => failure?.(Error("Tindakan tidak tersedia."));
        return (payload) =>
          request(name, payload)
            .then((value) => success?.(value))
            .catch((error) => failure?.(error));
      },
    },
  );
}
window.google = { script: { run: runner() } };
// Fetch public readiness and download the client at the same time.
window.OSDA_BOOT_READY = request("boot").then((boot) => {
  window.OSDA_BOOT = { ...window.OSDA_BOOT, ...boot };
});
const script = document.createElement("script");
script.src = new URL("./client.js", import.meta.url).href;
script.onerror = () =>
  window.OSDA_STARTUP.fail("Ruang pengurus belum termuat. Muat ulang halaman.");
document.body.append(script);
try {
  await window.OSDA_BOOT_READY;
} catch (e) {
  window.OSDA_STARTUP.fail(e);
}
