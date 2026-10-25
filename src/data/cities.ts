// Cities with built-in weather samples (also used as quick picks in the setup).
import type { Place } from '../engine/home';

export interface City extends Place {
  id: string;
  /** Names in Tamil and Hindi for the quick-pick chips. */
  ta: string;
  hi: string;
}

export const CITIES: City[] = [
  { id: 'chennai', name: 'Chennai', ta: 'சென்னை', hi: 'चेन्नई', lat: 13.0827, lon: 80.2707, admin: 'Tamil Nadu', country: 'India' },
  { id: 'nagercoil', name: 'Nagercoil', ta: 'நாகர்கோவில்', hi: 'नागरकोइल', lat: 8.1833, lon: 77.4119, admin: 'Tamil Nadu', country: 'India' },
  { id: 'madurai', name: 'Madurai', ta: 'மதுரை', hi: 'मदुरै', lat: 9.9252, lon: 78.1198, admin: 'Tamil Nadu', country: 'India' },
  { id: 'coimbatore', name: 'Coimbatore', ta: 'கோயம்புத்தூர்', hi: 'कोयंबटूर', lat: 11.0168, lon: 76.9558, admin: 'Tamil Nadu', country: 'India' },
  { id: 'vellore', name: 'Vellore', ta: 'வேலூர்', hi: 'वेल्लोर', lat: 12.9165, lon: 79.1325, admin: 'Tamil Nadu', country: 'India' },
  { id: 'bengaluru', name: 'Bengaluru', ta: 'பெங்களூரு', hi: 'बेंगलुरु', lat: 12.9716, lon: 77.5946, admin: 'Karnataka', country: 'India' },
  { id: 'hyderabad', name: 'Hyderabad', ta: 'ஹைதராபாத்', hi: 'हैदराबाद', lat: 17.385, lon: 78.4867, admin: 'Telangana', country: 'India' },
  { id: 'mumbai', name: 'Mumbai', ta: 'மும்பை', hi: 'मुंबई', lat: 19.076, lon: 72.8777, admin: 'Maharashtra', country: 'India' },
  { id: 'ahmedabad', name: 'Ahmedabad', ta: 'அகமதாபாத்', hi: 'अहमदाबाद', lat: 23.0225, lon: 72.5714, admin: 'Gujarat', country: 'India' },
  { id: 'delhi', name: 'Delhi', ta: 'டெல்லி', hi: 'दिल्ली', lat: 28.6139, lon: 77.209, admin: 'Delhi', country: 'India' },
  { id: 'jaipur', name: 'Jaipur', ta: 'ஜெய்ப்பூர்', hi: 'जयपुर', lat: 26.9124, lon: 75.7873, admin: 'Rajasthan', country: 'India' },
  { id: 'lucknow', name: 'Lucknow', ta: 'லக்னோ', hi: 'लखनऊ', lat: 26.8467, lon: 80.9462, admin: 'Uttar Pradesh', country: 'India' },
  { id: 'nagpur', name: 'Nagpur', ta: 'நாக்பூர்', hi: 'नागपुर', lat: 21.1458, lon: 79.0882, admin: 'Maharashtra', country: 'India' },
  { id: 'kolkata', name: 'Kolkata', ta: 'கொல்கத்தா', hi: 'कोलकाता', lat: 22.5726, lon: 88.3639, admin: 'West Bengal', country: 'India' },
];

export function cityName(c: City, lang: 'en' | 'ta' | 'hi'): string {
  return lang === 'ta' ? c.ta : lang === 'hi' ? c.hi : c.name;
}
