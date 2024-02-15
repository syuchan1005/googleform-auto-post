// @ts-ignore
import icon from 'data-url:@~/icon.png';

import { Storage } from '@plasmohq/storage';

import type { Form } from '@/contents/getPostFormUrl';

export {};

export type DaysOfWeekEn = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type StorageForms = {
    id: string;
    form: Form;
    periodicSettings: {
        enable: boolean;
        executeDaysOfWeek: DaysOfWeekEn[];
        executeOnNationalHoliday: boolean;
        executeTime: `${number}:${number}`;
    };
    lastExecutedResult?: {
        executedTimeMillis: number;
        success: boolean;
        message?: string;
    };
}[];

const storage = new Storage({ area: 'local' });

storage.watch({
    forms: async (c) => {
        await registerAlarms(c.newValue);
    },
});

const registerAlarms = async (forms: StorageForms) => {
    const registeredAlarms = await chrome.alarms.getAll();
    const periodicForms = (forms || [])
        .filter((f) => f.periodicSettings.enable)
        .map((f) => [f.id, f.periodicSettings.executeTime]);
    const periodicFormIds = periodicForms.map((f) => f[0]);
    for (const alarm of registeredAlarms.filter((alarm) => !periodicFormIds.includes(alarm.name))) {
        await chrome.alarms.clear(alarm.name);
    }
    for (const [formId, formExecuteTime] of periodicForms) {
        const registeredAlarm = registeredAlarms.find((alarm) => alarm.name === formId);
        if (registeredAlarm) {
            const scheduledTimeStr = new Date(registeredAlarm.scheduledTime).toISOString().substring(11, 16);
            if (scheduledTimeStr === formExecuteTime) {
                break;
            }
        }

        const [hour, minute] = formExecuteTime.split(':').map(Number);
        const executeTime = new Date();
        executeTime.setHours(hour);
        executeTime.setMinutes(minute);
        executeTime.setSeconds(0);
        executeTime.setMilliseconds(0);
        const now = Date.now();
        if (executeTime.getTime() < now) {
            executeTime.setDate(executeTime.getDate() + 1);
        }

        await chrome.alarms.create(formId, {
            when: executeTime.getTime(),
        });
    }
};

// Set up alarms each time the service worker starts
storage.get<StorageForms>('forms').then(registerAlarms);

chrome.alarms.onAlarm.addListener(async (alarm) => {
    const forms = await storage.get<StorageForms>('forms');
    const argFormId = alarm.name;
    const form = forms.find((f) => f.id === argFormId);
    if (!form) {
        return;
    }

    const executeTime = new Date();
    const [hour, minute] = form.periodicSettings.executeTime.split(':').map(Number);
    executeTime.setHours(hour);
    executeTime.setMinutes(minute);
    executeTime.setSeconds(0);
    executeTime.setMilliseconds(0);

    let result: { success: boolean; message?: string; executedTimeMillis?: number; };
    if (Math.abs(executeTime.getTime() - Date.now()) < 5 * 60 * 1000 /* 5 minutes */) {
        result = await executeOnce(argFormId);
    } else {
        result = {
            executedTimeMillis: Date.now(),
            success: false,
            message: 'Timeout',
        };
        await storage.set('forms', forms.map((f) => (f.id === argFormId ? { ...f, lastExecutedResult: result } : f)));
    }

    chrome.notifications.create(argFormId, {
        type: 'basic',
        iconUrl: icon,
        title: form.form.formName,
        message: result.success ? 'フォームを送信しました' : `フォームの送信に失敗しました: ${result.message}`,
    });
});

export const executeOnce = async (
    formId: string,
    force: boolean = false,
): Promise<{ success: boolean; message?: string }> => {
    const forms = await storage.get<StorageForms>('forms');
    const storageForm = forms.find((f) => f.id === formId);
    if (!storageForm) {
        return;
    }

    let failedResult: { success: boolean; message: string; };
    if (!force) {
        const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
        if (!storageForm.periodicSettings.executeDaysOfWeek.includes(dayOfWeek as DaysOfWeekEn)) {
            failedResult = { success: false, message: 'Day of week' };
        } else {
            const nationalHolidays = await getNationalHolidays(new Date().getFullYear());
            if (
                !storageForm.periodicSettings.executeOnNationalHoliday &&
                nationalHolidays.includes(new Date().toISOString().slice(0, 10))
            ) {
                failedResult = { success: false, message: 'National holiday' };
            }
        }
    }

    let fetchResult: { success: boolean; message: string; };
    if (!failedResult) {
        const formData = new FormData();
        storageForm.form.fields
            .filter((f) => f.name.startsWith('entry.') || f.name === 'emailAddress')
            .forEach((f) => formData.append(f.name, f.value));
        fetchResult = await fetch(storageForm.form.postUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: formData,
        })
            .then((r) => (r.status === 200 ? { success: true, message: 'OK' } : { success: false, message: 'Unknown' }))
            .catch(() => ({ success: false, message: 'Network error' }));
    }

    const result = fetchResult || failedResult;
    await storage.set(
        'forms',
        forms.map((f) => {
            if (f.id === formId) {
                return {
                    ...f,
                    lastExecutedResult: {
                        executedTimeMillis: Date.now(),
                        ...result,
                    },
                };
            }
            return f;
        }),
    );
    return result;
};

const getNationalHolidays = async (year: number): Promise<string[]> => {
    const holidays = await storage.get<string[]>('nationalHolidays');
    if (holidays) {
        return holidays;
    }
    const holidayList = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`)
        .then((r) => r.json())
        .then((r) => Object.keys(r));
    await storage.set('nationalHolidays', holidayList);
    return holidayList;
};
