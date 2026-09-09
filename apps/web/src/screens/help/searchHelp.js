/* The help search moved to @simplicity/core/domain/help, because
   apps/mobile searches the same manual and two copies of "which chapter
   answers this" would drift without anything failing.

   Re-exported from this path so the screen and the test that pins the
   matching rules keep their imports. */
export { searchHelp, chapterHits } from '@simplicity/core'
