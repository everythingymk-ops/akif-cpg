import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Akif CPG — Pricing Architect</CardTitle>
          <CardDescription>
            Pricing, landed-cost and trade-spend planning for CPG brands and
            manufacturers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Scaffold ready — pricing engine arrives in Step 1</Button>
        </CardContent>
      </Card>
    </main>
  );
}
