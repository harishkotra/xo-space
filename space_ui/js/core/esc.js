/* HTML escaping, in one place.

   Every view builds markup by string concatenation, so this is the single
   guard between workspace data — file paths, todo text, project names, all of
   it written by other tools — and the parser. It ran as eight separate copies
   before, and one of them (atlas.js) omitted the quote, which is exactly the
   character that matters when the result lands inside an attribute:
   `data-todo="${esc(t.key)}"`.

   Escape the quote too, always. A helper that is right six times out of seven
   is not a helper, it is a trap with good ergonomics. */
export const esc=s=>String(s??'').replace(
  /[&<>"]/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]),
);
