export interface SlideData {
  id: string;
  imageUrl?: string;
  headline?: string;
  subheadline?: string;
  bullets?: string[];
  backgroundColor?: string;
  visualDescription?: string;
  originalIdea?: {
    title: string;
    content: string;
    category: string;
  };
  timestamp?: string;
  isUploaded?: boolean;
  source?: "question" | "exploratory" | "slides";
}

