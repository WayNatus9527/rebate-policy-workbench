import Workbench from './workbench';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic='force-dynamic';
async function AuthenticatedWorkbench(){await requireChatGPTUser('/');return <Workbench/>;}
export default function Page(){return <AuthenticatedWorkbench/>;}
