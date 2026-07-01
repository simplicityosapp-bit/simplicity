/* ════════════════════════════════════════════════════════════════
   PAGE ICONS — curated Lucide set for the page builder.
   ════════════════════════════════════════════════════════════════
   A deliberately SMALL, named-import set (not the whole lucide-react
   library) so the public page bundle stays lean and the icon picker
   stays curated/on-brand. Both the picker (builder) and the renderer
   (public page) resolve icons by name through ICONS here.

   To offer more icons, add a named import + an ICONS entry. */

import {
  Check, Star, Heart, Sparkles, Sun, Moon, Leaf, Target,
  Award, Clock, Calendar, Phone, Mail, MapPin, MessageCircle, Users,
  BookOpen, Compass, Smile, Shield, Zap, Coffee, Feather, Gift,
} from 'lucide-react'

/* name → component. The key is what gets stored in section props. */
export const ICONS = {
  Check, Star, Heart, Sparkles, Sun, Moon, Leaf, Target,
  Award, Clock, Calendar, Phone, Mail, MapPin, MessageCircle, Users,
  BookOpen, Compass, Smile, Shield, Zap, Coffee, Feather, Gift,
}

/* Ordered list of names for the picker grid. */
export const ICON_NAMES = Object.keys(ICONS)

/* Resolve a stored icon name → component, falling back to Check so a renamed/
   removed icon never crashes the page. */
export const iconByName = (name) => ICONS[name] || Check
