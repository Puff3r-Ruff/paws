

/* -------------------- NAV CAROUSEL -------------------- */

const slides = document.querySelectorAll(".slide");
const leftArrow = document.querySelector(".left-arrow");
const rightArrow = document.querySelector(".right-arrow");

let index = 0;
let autoRotate;

function showSlide(i){
    slides.forEach(s => s.classList.remove("active"));
    slides[i].classList.add("active");
}

function nextSlide(){
    index = (index + 1) % slides.length;
    showSlide(index);
}

function prevSlide(){
    index = (index - 1 + slides.length) % slides.length;
    showSlide(index);
}

function startAuto(){
    autoRotate = setInterval(nextSlide, 3000);
}

function stopAuto(){
    clearInterval(autoRotate);
}

showSlide(index);
startAuto();

rightArrow.addEventListener("click", () => { stopAuto(); nextSlide(); });
leftArrow.addEventListener("click", () => { stopAuto(); prevSlide(); });

/* -------------------- ABOUT CAROUSEL -------------------- */

const aboutTabs = document.querySelectorAll(".about-tab");
const aboutLeft = document.querySelector(".about-left");
const aboutRight = document.querySelector(".about-right");

let aboutIndex = 0;
let aboutAuto;

function showAbout(i){
    aboutTabs.forEach(t => t.classList.remove("active"));
    aboutTabs[i].classList.add("active");
}

function nextAbout(){
    aboutIndex = (aboutIndex + 1) % aboutTabs.length;
    showAbout(aboutIndex);
}

function prevAbout(){
    aboutIndex = (aboutIndex - 1 + aboutTabs.length) % aboutTabs.length;
    showAbout(aboutIndex);
}

function startAboutAuto(){
    aboutAuto = setInterval(nextAbout, 3000);
}

function stopAboutAuto(){
    clearInterval(aboutAuto);
}

showAbout(aboutIndex);
startAboutAuto();

aboutRight.addEventListener("click", () => { stopAboutAuto(); nextAbout(); });
aboutLeft.addEventListener("click", () => { stopAboutAuto(); prevAbout(); });

