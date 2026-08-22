const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "restroom";
}

export function restroomPath(restroom: { id: string; name: string }) {
  return `/restrooms/${slugify(restroom.name)}--${restroom.id}`;
}

export function businessPath(business: { id: string; business_name: string }) {
  return `/businesses/${slugify(business.business_name)}--${business.id}`;
}

export function idFromPublicSlug(slug: string) {
  return slug.match(uuidPattern)?.[1]?.toLowerCase() || null;
}
