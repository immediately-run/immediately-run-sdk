/** The one sprite string, injected once per document by ProviderIcon. Typed `string`,
 *  not the literal — the api snapshot pins the SHAPE, and a refresh must not read as a
 *  breaking change (the sprite's content is this repo's own generated artifact). */
declare const PROVIDER_ICON_SPRITE: string;
/** The models.dev provider ids with an icon in the sprite (the `pi-<id>` symbol set). */
declare const PROVIDER_ICON_IDS: readonly string[];

export { PROVIDER_ICON_IDS, PROVIDER_ICON_SPRITE };
