
let templateNavIndex = 0;
const templateNavCards = document.querySelectorAll(".template-card");
const templateNavPrev = document.querySelector(".templateNav-left");
const templateNavNext = document.querySelector(".templateNav-right");

function templateNavShowCard(i) {
  templateNavCards.forEach(c => c.classList.remove("active"));
  templateNavCards[i].classList.add("active");
}

if (templateNavPrev && templateNavNext) {
  templateNavNext.addEventListener("click", () => {
    templateNavIndex = (templateNavIndex + 1) % templateNavCards.length;
    templateNavShowCard(templateNavIndex);
  });

  templateNavPrev.addEventListener("click", () => {
    templateNavIndex = (templateNavIndex - 1 + templateNavCards.length) % templateNavCards.length;
    templateNavShowCard(templateNavIndex);
  });

  setInterval(() => {
    templateNavIndex = (templateNavIndex + 1) % templateNavCards.length;
    templateNavShowCard(templateNavIndex);
  }, 3000);
}
