/* The multi-gender word list and glyph handling moved to
   @simplicity/core/domain/multiGender, because apps/mobile needs the same
   strings and cannot render them the same way: it deliberately does not
   load the merge font (the converted TTF was a suspect while a device
   build was closing instantly on launch), so a glyph there is a box. It
   renders mgToReadable() instead.

   Re-exported from this path so the five importers here keep their
   imports and the merge-glyph tests keep pointing at one implementation. */
export { MG_GLYPHS, MG_WORDS, hasMG, mgToReadable, mgStrip } from '@simplicity/core'
