import { RestroomExplorer } from "@/components/restroom-explorer";
import { getAdvertisingOffer } from "@/lib/advertising";

export default function HomePage() {
  return <RestroomExplorer adOffer={getAdvertisingOffer()} />;
}
