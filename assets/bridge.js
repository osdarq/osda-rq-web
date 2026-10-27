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
try {
  const boot = await request("boot");
  window.OSDA_BOOT = { ...window.OSDA_BOOT, ...boot };
  const script = document.createElement("script");
  script.src = "./assets/client.js";

  script.onerror = () =>
    window.OSDA_STARTUP.fail(
      "Ruang pengurus belum termuat. Muat ulang halaman.",
    );
  document.body.append(script);
} catch (e) {
  document.querySelector("#startup-loading").hidden = true;
  document.querySelector("#login-submit").disabled = true;
  document.querySelector("#login-error").textContent = e.message;

  window.OSDA_STARTUP.error = e.message;
}
