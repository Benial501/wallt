import {
  Tag, House, ShoppingBasket, Car, ShoppingBag, Heart, Dumbbell,
  Music, Plane, Wallet, BookOpen, Gift, Briefcase, Coffee,
  Gamepad2, GraduationCap, PawPrint, Siren, Scale, HeartHandshake, SprayCan,
  UtensilsCrossed, Pizza, Sandwich, IceCreamBowl, Cake, Wine, Beer,
  CookingPot, Apple, Beef, Fish, Milk, Bus, TrainFront,
  TramFront, Bike, Motorbike, Fuel, ParkingCircle, Ship, Truck,
  MapPin, Luggage, BedDouble, Tent, Palmtree, Sofa, Lamp,
  Lightbulb, Droplets, Flame, Wrench, Hammer, KeyRound, Wifi,
  Phone, Smartphone, Laptop, Monitor, Printer, Headphones, Camera,
  Tv, Stethoscope, Pill, Cross, HeartPulse, Activity, Baby,
  ToyBrick, Users, Flower2, Scissors, Shirt, Footprints, Watch,
  Gem, Sparkles, Ticket, Clapperboard, Drama, Palette, Paintbrush,
  Volleyball, Mountain, Trees, Leaf, Building2, Landmark, Banknote,
  CreditCard, PiggyBank, Coins, ChartNoAxesCombined, Receipt, Calculator, ShieldCheck,
  HandCoins, BadgeEuro, CalendarDays, Repeat, Warehouse,
} from 'lucide-vue-next';
import catalog from '../data/categoryIcons.generated.json' with { type: 'json' };

const icons = {
  Tag, House, ShoppingBasket, Car, ShoppingBag, Heart, Dumbbell,
  Music, Plane, Wallet, BookOpen, Gift, Briefcase, Coffee,
  Gamepad2, GraduationCap, PawPrint, Siren, Scale, HeartHandshake, SprayCan,
  UtensilsCrossed, Pizza, Sandwich, IceCreamBowl, Cake, Wine, Beer,
  CookingPot, Apple, Beef, Fish, Milk, Bus, TrainFront,
  TramFront, Bike, Motorbike, Fuel, ParkingCircle, Ship, Truck,
  MapPin, Luggage, BedDouble, Tent, Palmtree, Sofa, Lamp,
  Lightbulb, Droplets, Flame, Wrench, Hammer, KeyRound, Wifi,
  Phone, Smartphone, Laptop, Monitor, Printer, Headphones, Camera,
  Tv, Stethoscope, Pill, Cross, HeartPulse, Activity, Baby,
  ToyBrick, Users, Flower2, Scissors, Shirt, Footprints, Watch,
  Gem, Sparkles, Ticket, Clapperboard, Drama, Palette, Paintbrush,
  Volleyball, Mountain, Trees, Leaf, Building2, Landmark, Banknote,
  CreditCard, PiggyBank, Coins, ChartNoAxesCombined, Receipt, Calculator, ShieldCheck,
  HandCoins, BadgeEuro, CalendarDays, Repeat, Warehouse,
};
export const CATEGORY_ICON_OPTIONS = catalog;
export const resolveCategoryIcon = name => icons[name] || Tag;
