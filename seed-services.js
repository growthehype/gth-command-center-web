// ONE-TIME SCRIPT — Run this in your browser console while logged into the CRM
// This adds GTH services to your Services page
// After running, refresh the page and check Services

const services = [
  { name: "Social Media Management", category: "Growth", description: "Content creation, scheduling, engagement, monthly reporting", pricing_model: "monthly", default_price: 2500, typical_hours: 20, deliverables: JSON.stringify(["Content calendar", "12+ posts/month", "Stories & reels", "Community engagement", "Monthly analytics report"]), active: 1 },
  { name: "Google Ads Management", category: "Paid Media", description: "Campaign setup, optimization, keyword research, reporting", pricing_model: "monthly", default_price: 1500, typical_hours: 10, deliverables: JSON.stringify(["Campaign setup & optimization", "Keyword research", "Ad copywriting", "Bi-weekly optimization", "Monthly performance report"]), active: 1 },
  { name: "Meta Ads Management", category: "Paid Media", description: "Facebook & Instagram ad campaign management", pricing_model: "monthly", default_price: 1500, typical_hours: 10, deliverables: JSON.stringify(["Campaign strategy", "Audience targeting", "Ad creative direction", "A/B testing", "Monthly reporting"]), active: 1 },
  { name: "Website Design & Development", category: "Web Design", description: "Custom website design, development, and launch", pricing_model: "project", default_price: 5000, typical_hours: 40, deliverables: JSON.stringify(["Custom design", "Responsive development", "SEO setup", "Speed optimization", "CMS training"]), active: 1 },
  { name: "Brand Strategy & Identity", category: "Creative", description: "Complete brand identity design and strategy", pricing_model: "project", default_price: 3500, typical_hours: 25, deliverables: JSON.stringify(["Brand discovery", "Logo design", "Color palette", "Typography", "Brand guidelines document"]), active: 1 },
  { name: "Content Creation & Production", category: "Creative", description: "Photo, video, and graphic content production", pricing_model: "monthly", default_price: 2000, typical_hours: 15, deliverables: JSON.stringify(["Photo shoots", "Video production", "Graphic design", "Content repurposing"]), active: 1 },
  { name: "SEO & Digital Marketing", category: "SEO", description: "Search engine optimization and organic growth", pricing_model: "monthly", default_price: 1800, typical_hours: 12, deliverables: JSON.stringify(["Technical SEO audit", "On-page optimization", "Link building", "Keyword tracking", "Monthly report"]), active: 1 },
  { name: "Photography", category: "Photography", description: "Professional photography for brands and businesses", pricing_model: "project", default_price: 800, typical_hours: 4, deliverables: JSON.stringify(["On-location shoot", "Photo editing", "High-res deliverables", "Usage rights"]), active: 1 },
  { name: "Videography", category: "Videography", description: "Professional video production and editing", pricing_model: "project", default_price: 1500, typical_hours: 8, deliverables: JSON.stringify(["Pre-production planning", "On-location filming", "Editing & color grading", "Music licensing", "Final delivery"]), active: 1 },
  { name: "Consulting & Strategy", category: "Consulting", description: "Marketing strategy consulting and business advisory", pricing_model: "hourly", default_price: 150, typical_hours: 1, deliverables: JSON.stringify(["Strategic consultation", "Marketing audit", "Growth roadmap", "Action plan"]), active: 1 },
  { name: "Monthly Retainer", category: "Growth", description: "Full-service monthly marketing retainer", pricing_model: "monthly", default_price: 4000, typical_hours: 30, deliverables: JSON.stringify(["Dedicated account manager", "Strategy & planning", "Execution & management", "Monthly reporting & review"]), active: 1 },
  { name: "Reporting & Analytics", category: "Reporting", description: "Custom reporting dashboards and analytics", pricing_model: "monthly", default_price: 500, typical_hours: 5, deliverables: JSON.stringify(["Custom dashboard setup", "Monthly analytics report", "KPI tracking", "Recommendations"]), active: 1 },
];

(async () => {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
  const sb = createClient("https://lihziucupctxwayijeoc.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpaHppdWN1cGN0eHdheWlqZW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NTEzODMsImV4cCI6MjA5MTAyNzM4M30.zOGMrhbX2412Nkyw-222xV_uUkCA_PqBUI-w_SQWR1M");

  // Get current session
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { console.error("❌ Not logged in! Log into the CRM first."); return; }

  const user_id = session.user.id;
  console.log("✅ Authenticated as:", user_id);

  let success = 0;
  for (const svc of services) {
    const { error } = await sb.from("services").insert({ ...svc, user_id, created_at: new Date().toISOString() });
    if (error) {
      console.warn(`⚠️ Failed: ${svc.name}`, error.message);
    } else {
      success++;
      console.log(`✅ Added: ${svc.name}`);
    }
  }
  console.log(`\n🎉 Done! ${success}/${services.length} services added. Refresh the page.`);
})();
