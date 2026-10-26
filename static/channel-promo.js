// 每次進入或重新整理時顯示；原生 dialog 支援 Esc 關閉與焦點限制。
const promo = document.querySelector("#channelPromo");
promo.addEventListener("click", event => {
  if (event.target !== promo) return;
  const bounds = promo.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) promo.close();
});
promo.showModal();
