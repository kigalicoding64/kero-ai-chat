import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAiSettings, validateAndSaveProvider } from '@/lib/provider-settings.functions';

export function AiProviderSettings() {
  const load = useServerFn(getAiSettings);
  const save = useServerFn(validateAndSaveProvider);
  const client = useQueryClient();
  const settings = useQuery({queryKey:['ai-settings'],queryFn:() => load()});
  const [keys,setKeys] = useState({nvidia:'',gemini:''});
  const action = useMutation({
    mutationFn: (input:{provider:'nvidia'|'gemini';activate:boolean}) => save({data:{...input,apiKey:keys[input.provider]}}),
    onSuccess: async (_,input) => {
      setKeys(prev => ({...prev,[input.provider]:''}));
      await Promise.all([client.invalidateQueries({queryKey:['ai-settings']}),client.invalidateQueries({queryKey:['provider-status']}),client.invalidateQueries({queryKey:['audit-logs']})]);
    },
  });
  if (settings.isPending) return <p className="mt-6 text-sm text-muted-foreground">Loading AI settings…</p>;
  if (settings.isError) return <div className="mt-6"><p className="text-sm text-destructive">{settings.error.message}</p><Button variant="outline" onClick={() => void settings.refetch()}>Retry</Button></div>;
  return <section className="mt-8 border-y border-border py-6">
    <h2 className="font-display text-lg font-semibold">AI provider</h2>
    <div className="mt-4 grid gap-5 sm:grid-cols-2">
      {(['nvidia','gemini'] as const).map(provider => {
        const active = settings.data?.activeProvider === provider;
        const configured = provider === 'gemini' ? settings.data?.geminiConfigured : settings.data?.nvidiaConfigured;
        const label = provider === 'gemini' ? 'Google Gemini' : 'NVIDIA NIM';
        return <div key={provider} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{label}</h3><span className={active ? 'text-xs text-primary' : 'text-xs text-muted-foreground'}>{active ? 'Active' : configured ? 'Key saved' : 'Not connected'}</span></div>
          <p className="mt-2 break-words text-xs text-muted-foreground">{provider === 'gemini' ? settings.data?.geminiModel : 'NVIDIA configured model'}</p>
          <Label htmlFor={`${provider}-key`} className="mt-4 block text-sm">{configured ? 'Replace API key' : 'API key'}</Label>
          <Input id={`${provider}-key`} type="password" autoComplete="new-password" spellCheck={false} value={keys[provider]} onChange={e => setKeys(prev => ({...prev,[provider]:e.target.value}))} placeholder={configured ? 'Saved securely' : 'Enter API key'} className="mt-2" disabled={action.isPending}/>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={action.isPending || (!configured && !keys[provider].trim())} onClick={() => action.mutate({provider,activate:false})}><KeyRound className="size-4"/>Validate & save</Button>
            <Button size="sm" disabled={action.isPending || active || (!configured && !keys[provider].trim())} onClick={() => action.mutate({provider,activate:true})}><ShieldCheck className="size-4"/>Use {provider === 'gemini' ? 'Gemini' : 'NVIDIA'}</Button>
          </div>
        </div>;
      })}
    </div>
    {action.isPending && <p className="mt-4 text-sm text-muted-foreground">Checking credentials and a real reply…</p>}
    {action.isError && <p role="alert" className="mt-4 text-sm text-destructive">{action.error.message}</p>}
    {action.isSuccess && <p role="status" className="mt-4 text-sm text-primary">{action.data.activated ? 'Provider validated and activated for chat and WhatsApp.' : 'API key validated and saved securely.'} ({action.data.durationMs} ms)</p>}
  </section>;
}