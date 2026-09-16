import {
  Baby,
  BookOpen,
  Car,
  Dumbbell,
  Earth,
  Gamepad2,
  Gem,
  GraduationCap,
  House,
  Laptop,
  Music,
  PawPrint,
  Plane,
  Smartphone,
  Target,
  TreePalm,
} from 'lucide-vue-next';

export const OBIETTIVO_ICON_OPTIONS = [
  { id: 'target', label: 'Obiettivo', icon: Target, legacyEmoji: '🎯' },
  { id: 'viaggio', label: 'Vacanza', icon: TreePalm, legacyEmoji: '🏖️' },
  { id: 'car', label: 'Auto', icon: Car, legacyEmoji: '🚗' },
  { id: 'casa', label: 'Casa', icon: House, legacyEmoji: '🏠' },
  { id: 'computer', label: 'Computer', icon: Laptop, legacyEmoji: '💻' },
  { id: 'telefono', label: 'Telefono', icon: Smartphone, legacyEmoji: '📱' },
  { id: 'volo', label: 'Viaggio in aereo', icon: Plane, legacyEmoji: '✈️' },
  { id: 'studio', label: 'Studio', icon: GraduationCap, legacyEmoji: '🎓' },
  { id: 'prezioso', label: 'Occasione speciale', icon: Gem, legacyEmoji: '💍' },
  { id: 'animale', label: 'Animale', icon: PawPrint, legacyEmoji: '🐕' },
  { id: 'gaming', label: 'Videogiochi', icon: Gamepad2, legacyEmoji: '🎮' },
  { id: 'famiglia', label: 'Famiglia', icon: Baby, legacyEmoji: '👶' },
  { id: 'fitness', label: 'Fitness', icon: Dumbbell, legacyEmoji: '🏋️' },
  { id: 'mondo', label: 'Grande viaggio', icon: Earth, legacyEmoji: '🌍' },
  { id: 'libri', label: 'Libri', icon: BookOpen, legacyEmoji: '📚' },
  { id: 'musica', label: 'Musica', icon: Music, legacyEmoji: '🎵' },
];

const iconsById = Object.fromEntries(OBIETTIVO_ICON_OPTIONS.map(({ id, icon }) => [id, icon]));
const idsByLegacyEmoji = Object.fromEntries(
  OBIETTIVO_ICON_OPTIONS.map(({ id, legacyEmoji }) => [legacyEmoji, id]),
);

export const normalizeObiettivoIconId = (value) => {
  if (value && iconsById[value]) return value;
  return idsByLegacyEmoji[value] || 'target';
};

export const resolveObiettivoIcon = (value) => iconsById[normalizeObiettivoIconId(value)] || Target;
