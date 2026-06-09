import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      await login(values);
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err?.data?.error || "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-6xl font-display uppercase tracking-tight" data-testid="heading-login">KIXXME</h1>
          <p className="text-muted-foreground font-sans mt-2" data-testid="text-login-sub">Enter the locker room.</p>
        </div>

        <div className="bg-card border-2 border-border p-6 shadow-[8px_8px_0_0_rgba(182,255,10,1)] dark:shadow-[8px_8px_0_0_rgba(182,255,10,0.2)]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-display text-xl uppercase">Email</FormLabel>
                    <FormControl>
                      <Input placeholder="athlete@example.com" {...field} className="border-2 border-border rounded-none focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary text-lg p-6 font-sans" data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-display text-xl uppercase">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="border-2 border-border rounded-none focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary text-lg p-6 font-sans" data-testid="input-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-14 rounded-none font-display text-2xl uppercase tracking-wider" disabled={isSubmitting} data-testid="button-submit">
                {isSubmitting ? "Entering..." : "Sign In"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-muted-foreground font-sans" data-testid="text-signup-prompt">
          Don't have a locker? <Link href="/signup" className="text-primary font-bold hover:underline" data-testid="link-signup">Claim one.</Link>
        </p>
      </div>
    </div>
  );
}
