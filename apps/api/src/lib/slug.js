/** Workspace slug generation (PLAN.md §6: citext UNIQUE, but we store
 *  pre-lowercased). Keeps it readable + collision-safe against a check fn. */

const MAX = 39;

export function slugify(input) {
  return (
    String(input || '')
      .toLowerCase()
      .trim()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX) || 'workspace'
  );
}

/** Append `-2`, `-3`, … until `exists(slug)` returns false. */
export async function uniqueSlug(base, exists) {
  let slug = base.slice(0, MAX);
  let n = 2;
  while (await exists(slug)) {
    const suffix = `-${n++}`;
    slug = `${base.slice(0, MAX - suffix.length)}${suffix}`;
  }
  return slug;
}
