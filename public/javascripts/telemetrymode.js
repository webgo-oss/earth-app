const modeButtons = document.querySelectorAll(".mode-btn");

modeButtons.forEach(btn => {
    btn.addEventListener("click", () => {

        modeButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const mode = btn.getAttribute("data-mode");
        document.body.setAttribute("data-mode", mode);
    });
});