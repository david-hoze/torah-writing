// Minimal, dependency-free player for the taaluma chapter narration.
// Enhances any <div class="audio"> containing an <audio class="audio-el">.
(function () {
  function fmt(t) {
    if (!isFinite(t)) return "0:00";
    t = Math.max(0, Math.floor(t));
    var m = Math.floor(t / 60), s = t % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function wire(root) {
    var audio = root.querySelector(".audio-el");
    var btn = root.querySelector(".audio-btn");
    var bar = root.querySelector(".audio-bar");
    var prog = root.querySelector(".audio-progress");
    var time = root.querySelector(".audio-time");
    if (!audio || !btn) return;

    btn.addEventListener("click", function () {
      if (audio.paused) audio.play(); else audio.pause();
    });
    audio.addEventListener("play", function () { root.classList.add("is-playing"); });
    audio.addEventListener("pause", function () { root.classList.remove("is-playing"); });
    audio.addEventListener("ended", function () {
      root.classList.remove("is-playing");
      if (prog) prog.style.width = "0%";
      if (time) time.textContent = fmt(audio.duration);
    });
    audio.addEventListener("loadedmetadata", function () {
      if (time) time.textContent = fmt(audio.duration);
    });
    audio.addEventListener("timeupdate", function () {
      if (audio.duration && prog) {
        prog.style.width = (audio.currentTime / audio.duration * 100) + "%";
      }
      if (time) {
        time.textContent = fmt(audio.currentTime) + " / " + fmt(audio.duration);
      }
    });
    if (bar) {
      bar.addEventListener("click", function (e) {
        if (!audio.duration) return;
        var r = bar.getBoundingClientRect();
        // RTL: the start of the bar is on the right edge
        var ratio = (r.right - e.clientX) / r.width;
        audio.currentTime = Math.min(1, Math.max(0, ratio)) * audio.duration;
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".audio").forEach(wire);
  });
})();
