const label = document.querySelector('#demo-label');
const labelButtons = document.querySelectorAll('[data-label]');

for (const button of labelButtons) {
  button.addEventListener('click', () => {
    label.textContent = button.dataset.label === 'name' ? 'Broadway' : 'Road 86';
    for (const other of labelButtons) {
      other.setAttribute('aria-pressed', String(other === button));
    }
  });
}

const cards = [...document.querySelectorAll('[data-reveal]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });

  for (const card of cards) {
    card.classList.add('reveal-pending');
    observer.observe(card);
  }

  reducedMotion.addEventListener('change', (event) => {
    if (!event.matches) return;
    observer.disconnect();
    for (const card of cards) card.classList.remove('reveal-pending');
  });
}
