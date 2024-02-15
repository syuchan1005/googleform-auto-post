import type { PlasmoMessaging } from '@plasmohq/messaging';

import { executeOnce } from '@/background';

export type ExecuteOnceRequest = {
    formId: string;
};

export type ExecuteOnceResponse = {
    success: boolean;
};

const handler: PlasmoMessaging.MessageHandler<ExecuteOnceRequest, ExecuteOnceResponse> = async (
    req,
    res,
) => {
    const result = await executeOnce(req.body.formId, true);
    res.send(result);
};

export default handler;
