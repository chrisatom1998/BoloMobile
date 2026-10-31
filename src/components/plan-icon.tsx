import { Briefcase, Bus, Compass, Hand, House, MessageCircle, ShoppingBag, Sparkles, Stethoscope, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import type { SceneCategory } from '@/data/scenes';
import { makeStyles, radius, useTheme } from '@/theme';

const planIcons: Record<string, LucideIcon> = {
  essentials: Hand,
  connection: MessageCircle,
  food: UtensilsCrossed,
  'getting-around': Bus,
  directions: Compass,
  shopping: ShoppingBag,
  'daily-life': House,
  health: Stethoscope,
  'social-life': Users,
  work: Briefcase,
  creator: Sparkles,
};

const categoryIcons: Record<SceneCategory, LucideIcon> = {
  Food: UtensilsCrossed,
  Travel: Bus,
  Everyday: House,
  Health: Stethoscope,
  Social: Users,
  Work: Briefcase,
};

/** Line icons in Bolo's brand colors, used instead of emoji so plans and scenes match the serif look. */
export function PlanIcon({ category, planId, size = 20 }: { category?: SceneCategory; planId?: string; size?: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Icon = (planId ? planIcons[planId] : undefined) ?? (category ? categoryIcons[category] : undefined) ?? Sparkles;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.badge, { width: size + 20, height: size + 20 }]}>
      <Icon color={colors.brand} size={size} strokeWidth={1.9} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  badge: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.brandSoft },
}));
