/*
 * UI primitives — the single seam between our screens and the render
 * target. Screens import { Box, Txt, Btn, Input } from here and never
 * touch raw <div>/<span>/<button>/<input> directly. The day we move to
 * React Native, we re-point these four files at RN components and the
 * feature screens don't change.
 *
 * Scope note: this layer intentionally wraps only layout/text/press/field
 * elements. SVG, form <select>, and i18n markup (<b> inside <Trans>) are
 * NOT primitivised yet — they map to separate RN concepts (react-native-svg,
 * Picker) and get their own primitives later. Container tags without their
 * own primitive (e.g. <form>, <label>, <section>) ride on `<Box as="...">`.
 */
export { default as Box } from './Box'
export { default as Txt } from './Txt'
export { default as Btn } from './Btn'
export { default as Input } from './Input'
export { default as Textarea } from './Textarea'
export { default as Lnk } from './Lnk'
