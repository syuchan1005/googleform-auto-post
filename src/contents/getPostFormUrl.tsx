import type { PlasmoCSConfig } from 'plasmo';

import { useMessage } from '@plasmohq/messaging/dist/hook';

export const config: PlasmoCSConfig = {
    matches: ['https://docs.google.com/forms/*'],
    //world: "MAIN",
};

export type CSRequest = {
    name: 'get-post-form-url';
};

export type Form = {
    formName: string;
    postUrl: string;
    fieldNameToDisplayNameMap: Record<string, string>;
    fields: {
        name: string;
        value: string;
    }[];
};

export type CSResponse = {
    form?: Form;
    error?: string;
};

const GetPostFormUrl = () => {
    useMessage<CSRequest, CSResponse>(async (req, res) => {
        try {
            const form = document.querySelector('form');
            const fieldDisplayNames = [...document.querySelectorAll('div[data-params]')]
                .map((e: HTMLDivElement) => JSON.parse(e.dataset.params.replace('%.@.', '[')))
                .reduce(
                    (prev, params) => ({
                        ...prev,
                        [`entry.${params[0][4][0][0]}`]: params[0][1],
                    }),
                    {},
                );
            const fields = [...form.querySelectorAll(`input[type='hidden']`)].map(
                (e: HTMLInputElement) => ({ name: e.name, value: e.value }),
            );
            res.send({
                form: {
                    formName: document.title,
                    postUrl: form.action,
                    fieldNameToDisplayNameMap: fieldDisplayNames,
                    fields,
                },
            });
        } catch (e) {
            res.send({ error: 'Failed to get form' });
        }
    });
    return null;
};

export default GetPostFormUrl;
