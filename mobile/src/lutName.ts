/** Drops the catalog prefix so titles read "Velvia" rather than "Fuji 风格 · Velvia". */
export const lutDisplayName = (name: string) => name.replace(/^(?:内置 · )?Fuji 风格 · /, '');
