import { useEffect, useRef, useState } from 'react';

export interface CategoryTab { id: string; name: string }

/** Jump links to the menu's categories. The one you clicked, or the one in view, is highlighted. */
export function CategoryTabs({ categories }: { categories: CategoryTab[] }) {
  const [active, setActive] = useState(categories[0]?.id ?? '');
  // A click wins over the scroll it causes: on a short page the clicked section may never reach the observed band.
  const clickedAt = useRef(0);
  const ids = categories.map((c) => c.id).join(',');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (Date.now() - clickedAt.current < 1000) return;
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id.replace(/^category-/, ''));
    }, { rootMargin: '-120px 0px -60% 0px' });
    for (const id of ids.split(',').filter(Boolean)) {
      const section = document.getElementById(`category-${id}`);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav aria-label="Menu categories" className="sticky top-14 z-30 -mx-4 flex gap-2 overflow-x-auto bg-cream px-4 py-2">
      {categories.map((category) => (
        <a key={category.id} href={`#category-${category.id}`} aria-current={active === category.id ? 'true' : undefined}
          onClick={() => { clickedAt.current = Date.now(); setActive(category.id); }}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold text-navy ${active === category.id ? 'bg-mustard' : 'bg-white'}`}>
          {category.name}
        </a>
      ))}
    </nav>
  );
}
