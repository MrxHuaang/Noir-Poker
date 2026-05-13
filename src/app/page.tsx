import { PokerTable } from "@/components/table/PokerTable";
import { HistoryPanel } from "@/components/HistoryPanel";

export default function Home() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8">
      <PokerTable />
      <HistoryPanel />
    </div>
  );
}
