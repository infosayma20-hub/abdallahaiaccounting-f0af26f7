import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw, Phone, Mail, Building2, MapPin, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Client {
  id: string;
  fields: {
    "Client Name"?: string;
    "Contact Email"?: string;
    "Phone Number"?: string;
    "Company Name"?: string;
    "Address"?: string;
    "Transaction Summary (AI)"?: string;
  };
}

const ClientsPage = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("airtable-clients");
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setClients(data?.records || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClients(); }, []);

  return (
    <div className="px-4 pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">العملاء</h1>
            <p className="text-xs text-muted-foreground">{clients.length} عميل</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchClients} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchClients}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {clients.map((client) => {
            const f = client.fields;
            const isExpanded = expandedId === client.id;
            return (
              <Card
                key={client.id}
                className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setExpandedId(isExpanded ? null : client.id)}
              >
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {f["Client Name"] || "بدون اسم"}
                      </p>
                      {f["Company Name"] && (
                        <p className="text-[10px] text-muted-foreground truncate">{f["Company Name"]}</p>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2.5">
                      {f["Contact Email"] && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-foreground truncate" dir="ltr">{f["Contact Email"]}</span>
                        </div>
                      )}
                      {f["Phone Number"] && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-foreground" dir="ltr">{f["Phone Number"]}</span>
                        </div>
                      )}
                      {f["Address"] && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-foreground">{f["Address"]}</span>
                        </div>
                      )}
                      {f["Transaction Summary (AI)"] && (
                        <div className="mt-2 p-3 rounded-lg bg-muted/50">
                          <p className="text-[10px] text-muted-foreground mb-1">ملخص المعاملات (AI)</p>
                          <p className="text-xs text-foreground leading-relaxed">{f["Transaction Summary (AI)"]}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClientsPage;
