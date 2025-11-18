import { type Language } from '../types';

export const styleOptions = ["Random", "Realism", "Photorealistic", "Cinematic", "Anime", "Vintage", "3D Animation", "Watercolor", "Claymation", "Line Art", "Pixel Art"];
export const lightingOptions = ["None", "Random", "Soft Daylight", "Golden Hour", "Studio Light", "Natural Light", "Dramatic Lighting", "Backlight", "Side Light", "Neon Light", "Hard Light", "Window Backlight", "Warm Lamp Light", "Mixed Light"];
export const cameraOptions = ["None", "Random", "Detail / Macro", "Close-up", "Medium Close-up", "Medium / Half Body", "Three-Quarter", "Full Body", "Flatlay", "Wide Shot", "Medium Shot", "Long Shot", "Dutch Angle", "Low Angle", "High Angle", "Overhead Shot"];
export const compositionOptions = ["Random", "Rule of Thirds", "Leading Lines", "Symmetry", "Golden Ratio", "Centered", "Asymmetrical"];
export const lensTypeOptions = ["Random", "Wide-Angle Lens", "Telephoto Lens", "Fisheye Lens", "Macro Lens", "50mm Lens", "85mm Lens"];
export const filmSimOptions = ["Random", "Fujifilm Velvia", "Kodak Portra 400", "Cinematic Kodachrome", "Vintage Polaroid", "Ilford HP5 (B&W)"];
export const effectOptions = [
  "None", "Random", "Bokeh Light", "Color Smoke", "Confetti", "Dust Particles", "Fire", "Fireworks", "Floating in Water", "Fog / Mist",
  "Glitter", "Golden Sparkles", "Lens Flare", "Light Streaks", "Magic Dust", "Powder Explosion", "Rain Drops", "Rainbow Light",
  "Snowfall", "Sparkler Trail", "Sun Rays", "Thunder Lightning", "Underwater Bubbles", "Water Splash", "Wind Motion Blur"
];
export const vibeOptions = [
  "Random", "Studio Background", "Tabletop / Surface", "Premium Texture", "Light & Shadow", "Color & Palette", "Natural & Organic", "Urban & Industrial", "Soft Daylight Studio", "Clean Pastel", "High-Key White", "Low-Key Moody", "Color Block", "Gradient Background", "Paper Roll Backdrop", "Smooth Cream", "Shadow Play / Hard Light", "Marble Tabletop", "Soft Pastel",
  "Bedroom", "Bathroom / Vanity", "Living Room", "Kitchen / Dining", "Workspace / Study", "Entryway / Laundry", "Clean Urban", "Aesthetic Coffee Shop", "City Night", "Tropical Beach", "Luxury Apartment", "Flower Garden", "Old Building", "Classic Library", "Minimalist Studio", "Rooftop Bar", "Autumn Park", "Tokyo Street", "Scandinavian Interior", "Enchanted Forest", "Cyberpunk City", "Bohemian Desert", "Modern Art Gallery", "Sunset Rooftop", "Snowy Mountain Cabin", "Industrial Loft", "Futuristic Lab", "Pastel Dreamscape", "Palace Interior", "Cottagecore Kitchen", "Coral Reef", "Parisian Street", "Asian Night Market", "Yacht Deck", "Vintage Train Station", "Outdoor Basketball Court", "Professional Kitchen", "Luxury Hotel Lobby", "Rock Concert Stage", "Zen Garden", "Mediterranean Villa Terrace", "Outer Space / Sci-Fi", "Modern Workspace", "Hot Spring", "Fantasy Throne Room", "Skyscraper Summit", "Sports Car Garage", "Botanical Greenhouse", "Ice Rink", "Classical Dance Studio", "Night Beach Party", "Ancient Library", "Mountain View Deck", "Modern Dance Studio", "Speakeasy Bar", "Rainforest Trail", "Terraced Rice Paddy",
  "Aesthetic Cafe", "Balinese Villa", "Beach Party Night", "Classic Dance Studio", "Country Kitchen", "Cruise Deck", "Local – Aesthetic Kopitiam", "Local – Bamboo House (Kampung Style)", "Local – Cameron Highlands Tea Farm", "Local – Dataran Merdeka", "Local – Heritage Street Melaka", "Local – Kampung House", "Local – Langkawi Beach", "Local – Mamak Stall (Night Vibe)", "Local – Pasar Malam", "Local – Penang Street Art", "Local – Petronas Twin Towers View", "Local – Putrajaya Bridge", "Local – Rainforest Resort", "Local – Rice Field (Sawah Padi)", "Local – Street Kopitiam", "Local – Subang Airport Hangar"
];
export const poseOptions = ["Random", "Professional Model Pose", "Casual Standing", "Sitting on Edge of Chair", "Slow Walking", "Leaning on Wall", "Half-Body Turn", "Looking at Camera", "Looking Away"];


// A type for the state
export interface CreativeDirectionState {
  vibe: string;
  style: string;
  lighting: string;
  camera: string;
  composition: string;
  lensType: string;
  filmSim: string;
  effect: string;
  pose: string;
  creativityLevel: number;
}

// A function to get the initial state
export const getInitialCreativeDirectionState = (): CreativeDirectionState => ({
  vibe: 'Random',
  style: 'Random',
  lighting: 'Random',
  camera: 'Random',
  composition: 'Random',
  lensType: 'Random',
  filmSim: 'Random',
  effect: 'None',
  pose: 'Random',
  creativityLevel: 5,
});