import { Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function RegisterPatientCta() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col items-start gap-3 pt-6">
        <div className="rounded-full bg-primary/10 p-3">
          <UserPlus className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Register New Patient</h2>
          <p className="text-sm text-muted-foreground">
            Create a new patient record and generate an OP number.
          </p>
        </div>
        <Button asChild>
          <Link to="/patients/new">Register patient</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
