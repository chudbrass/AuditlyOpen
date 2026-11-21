declare module "nspell" {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): NSpell;
  }
  function nspell(dictionary: { aff: Uint8Array; dic: Uint8Array }): NSpell;
  export = nspell;
}

declare module "dictionary-en" {
  const dictionary: { aff: Uint8Array; dic: Uint8Array };
  export default dictionary;
}

declare module "dictionary-fr" {
  const dictionary: { aff: Uint8Array; dic: Uint8Array };
  export default dictionary;
}
