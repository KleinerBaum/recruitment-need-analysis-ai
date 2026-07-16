import { RecruitmentWorkspace } from "@/components/recruitment-workspace";
import { DEMO_JOB_ADS } from "@/lib/data/demo-job-ads";

export default function HomePage() {
  return <RecruitmentWorkspace demoAds={DEMO_JOB_ADS} />;
}
