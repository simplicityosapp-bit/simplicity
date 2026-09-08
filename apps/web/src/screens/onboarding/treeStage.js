/* The tree-stage rule moved to @simplicity/core/domain/onboarding, beside
   the step list it is a function of — apps/mobile draws the same tree over
   the same flow, and a stage rule that disagreed with the step count on one
   platform is exactly the failure its own comment describes.

   Re-exported from this path so OnboardingTree and the test that pins the
   two promises keep their imports. Its own module rather than a second
   export from OnboardingTree, which would cost that file its fast refresh. */
export { treeStage } from '@simplicity/core'
