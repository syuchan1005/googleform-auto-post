import React, { useCallback, useState } from 'react';

import './style.css';

import { sendToBackground, sendToContentScript } from '@plasmohq/messaging';
import { Storage } from '@plasmohq/storage';
import { useStorage } from '@plasmohq/storage/hook';

import type { DaysOfWeekEn, StorageForms } from '@/background';
import type { ExecuteOnceRequest, ExecuteOnceResponse } from '@/background/messages/executeOnce';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CSRequest, CSResponse, Form } from '@/contents/getPostFormUrl';
import { Pencil2Icon, PlayIcon, ReloadIcon, TableIcon, TrashIcon } from '@radix-ui/react-icons';
import { PopoverClose } from '@radix-ui/react-popover';

import set = chrome.cookies.set;

const daysOfWeekEnToJp: Record<DaysOfWeekEn, string> = {
    mon: '月',
    tue: '火',
    wed: '水',
    thu: '木',
    fri: '金',
    sat: '土',
    sun: '日',
};

const extraFields = {
    emailAddress: 'メールアドレス',
};

function IndexPopup() {
    const [forms, setForms] = useStorage<StorageForms>({
        key: 'forms',
        instance: new Storage({ area: 'local' }),
    });

    const handleClickAdd = useCallback(async () => {
        const res = await sendToContentScript<CSRequest, CSResponse>({
            name: 'get-post-form-url',
        }).catch((e) => ({ form: undefined, error: e.message }));
        if (res.error || !res.form) {
            return;
        }

        await setForms((prev) => [
            ...(prev || []),
            {
                id: crypto.randomUUID(),
                form: res.form,
                periodicSettings: {
                    enable: true,
                    executeDaysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
                    executeOnNationalHoliday: false,
                    executeTime: '15:00',
                },
            },
        ]);
    }, []);

    const [executingFormIds, setExecutingFormIds] = useState<string[]>([]);
    const handleClickExecute = useCallback(async (id: string) => {
        setExecutingFormIds((prev) => [...prev, id]);
        await sendToBackground<ExecuteOnceRequest, ExecuteOnceResponse>({
            name: 'executeOnce',
            body: { formId: id },
        });
        setExecutingFormIds((prev) => prev.filter((i) => i !== id));
    }, []);

    const handleClickDelete = useCallback(async (id: string) => {
        await setForms((prev) => (prev || []).filter((f) => f.id !== id));
    }, []);

    const [editFields, setEditFields] = useState<
        {
            displayName: string;
            name: string;
            value: string;
        }[]
    >([]);
    const handleEditFields = useCallback((open: boolean, form: StorageForms[number]) => {
        console.log('handleEditFields', open, form);
        if (!open) return;
        setEditFields(
            form.form.fields.map((field) => ({
                displayName:
                    form.form.fieldNameToDisplayNameMap[field.name] || extraFields[field.name],
                name: field.name,
                value: field.value,
            })),
        );
    }, []);
    const handleSaveEditFields = useCallback(
        async (formId: string) => {
            await setForms((prev) =>
                prev.map((f) => {
                    if (f.id === formId) {
                        return {
                            ...f,
                            form: {
                                ...f.form,
                                fields: editFields.map((field) => ({
                                    name: field.name,
                                    value: field.value,
                                })),
                            },
                        };
                    }
                    return f;
                }),
            );
            setEditFields([]);
        },
        [editFields],
    );

    const [editPeriodicSettings, setEditPeriodicSettings] =
        useState<StorageForms[number]['periodicSettings']>();
    const handleEditPeriodicSettings = useCallback((open: boolean, form: StorageForms[number]) => {
        if (!open) return;
        setEditPeriodicSettings(form.periodicSettings);
    }, []);
    const handleSaveEditPeriodicSettings = useCallback(
        async (formId: string) => {
            await setForms((prev) =>
                prev.map((f) => {
                    if (f.id === formId) {
                        return {
                            ...f,
                            periodicSettings: editPeriodicSettings,
                        };
                    }
                    return f;
                }),
            );
            setEditPeriodicSettings(undefined);
        },
        [editPeriodicSettings],
    );

    return (
        <div className="w-max min-h-96 p-4">
            <Button onClick={handleClickAdd} className="mb-4">
                Add new form
            </Button>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>フォーム名</TableHead>
                        <TableHead>値</TableHead>
                        <TableHead>定期実行</TableHead>
                        <TableHead>最終実行日時</TableHead>
                        <TableHead></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(forms || []).map((form) => (
                        <TableRow key={form.id}>
                            <TableCell>{form.form.formName}</TableCell>
                            <TableCell>
                                <Popover onOpenChange={(open) => handleEditFields(open, form)}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="icon">
                                            <TableIcon className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 h-48 overflow-auto">
                                        <div className="grid gap-2">
                                            <div className="grid grid-cols-3">
                                                <PopoverClose asChild>
                                                    <Button
                                                        style={{ gridColumn: 3 }}
                                                        onClick={() =>
                                                            handleSaveEditFields(form.id)
                                                        }>
                                                        変更する
                                                    </Button>
                                                </PopoverClose>
                                            </div>
                                            {editFields
                                                .filter((field) => !!field.displayName)
                                                .map((field) => (
                                                    <div
                                                        className="grid grid-cols-3 items-center gap-4"
                                                        key={field.name}>
                                                        <Label htmlFor={field.name}>
                                                            {field.displayName}
                                                        </Label>
                                                        <Input
                                                            id={field.name}
                                                            value={field.value}
                                                            onChange={(e) =>
                                                                setEditFields((prev) =>
                                                                    prev.map((f) =>
                                                                        f.name === field.name
                                                                            ? {
                                                                                  ...f,
                                                                                  value: e.target
                                                                                      .value,
                                                                              }
                                                                            : f,
                                                                    ),
                                                                )
                                                            }
                                                            className="col-span-2 h-8"
                                                        />
                                                    </div>
                                                ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </TableCell>
                            <TableCell>
                                {form.periodicSettings.enable
                                    ? ''
                                    : '(無効)'}
                                {form.periodicSettings.executeDaysOfWeek
                                    .map((d) => daysOfWeekEnToJp[d])
                                    .join(', ')}
                                {form.periodicSettings.executeOnNationalHoliday
                                    ? ''
                                    : ' (祝日を除く)'}
                                {` ${form.periodicSettings.executeTime}`}
                                <Popover
                                    onOpenChange={(open) => handleEditPeriodicSettings(open, form)}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="icon" className="ml-2">
                                            <Pencil2Icon className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-96">
                                        <div className="grid grid-cols-3 mb-2">
                                            <PopoverClose asChild>
                                                <Button
                                                    style={{ gridColumn: 3 }}
                                                    onClick={() =>
                                                        handleSaveEditPeriodicSettings(form.id)
                                                    }>
                                                    変更する
                                                </Button>
                                            </PopoverClose>
                                        </div>
                                        {editPeriodicSettings && (
                                            <div className="grid gap-3">
                                                <div className="flex gap-2">
                                                    <Checkbox
                                                        id="enable"
                                                        checked={editPeriodicSettings.enable}
                                                        onCheckedChange={(checked) => {
                                                            setEditPeriodicSettings((prev) => ({
                                                                ...prev,
                                                                enable: !!checked,
                                                            }));
                                                        }}
                                                    />
                                                    <Label htmlFor="enable">定期実行する</Label>
                                                </div>
                                                <div className="flex gap-2 flex-wrap">
                                                    <Label>曜日</Label>
                                                    {Object.entries(daysOfWeekEnToJp).map(
                                                        ([en, jp]: [DaysOfWeekEn, string]) => (
                                                            <div className="flex gap-1" key={en}>
                                                                <Checkbox
                                                                    id={en}
                                                                    checked={editPeriodicSettings.executeDaysOfWeek.includes(
                                                                        en,
                                                                    )}
                                                                    onCheckedChange={(checked) => {
                                                                        setEditPeriodicSettings(
                                                                            (prev) => {
                                                                                if (checked) {
                                                                                    return {
                                                                                        ...prev,
                                                                                        executeDaysOfWeek:
                                                                                            [
                                                                                                ...prev.executeDaysOfWeek,
                                                                                                en,
                                                                                            ],
                                                                                    };
                                                                                }
                                                                                return {
                                                                                    ...prev,
                                                                                    executeDaysOfWeek:
                                                                                        prev.executeDaysOfWeek.filter(
                                                                                            (d) =>
                                                                                                d !==
                                                                                                en,
                                                                                        ),
                                                                                };
                                                                            },
                                                                        );
                                                                    }}
                                                                />
                                                                <Label htmlFor={en}>{jp}</Label>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <Checkbox
                                                        id="executeOnNationalHoliday"
                                                        checked={
                                                            !editPeriodicSettings.executeOnNationalHoliday
                                                        }
                                                        onCheckedChange={(checked) => {
                                                            setEditPeriodicSettings((prev) => ({
                                                                ...prev,
                                                                executeOnNationalHoliday: !checked,
                                                            }));
                                                        }}
                                                    />
                                                    <Label htmlFor="executeOnNationalHoliday">
                                                        祝日を除く
                                                    </Label>
                                                </div>

                                                <div className="grid grid-cols-3 items-center">
                                                    <Label htmlFor="executeTime">実行時刻</Label>
                                                    <Input
                                                        type="time"
                                                        pattern="[0-9]{2}:[0-9]{2}"
                                                        id="executeTime"
                                                        className="col-span-2"
                                                        value={editPeriodicSettings.executeTime}
                                                        onChange={(e) => {
                                                            setEditPeriodicSettings((prev) => ({
                                                                ...prev,
                                                                executeTime: e.target
                                                                    .value as `${number}:${number}`,
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </PopoverContent>
                                </Popover>
                            </TableCell>
                            <TableCell>
                                {form.lastExecutedResult ? (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>{`${new Date(form.lastExecutedResult.executedTimeMillis).toLocaleString()}${form.lastExecutedResult.success ? '' : ' (失敗)'}`}</TooltipTrigger>
                                            <TooltipContent>
                                                <p>{form.lastExecutedResult.message}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                ) : (
                                    '未実行'
                                )}
                            </TableCell>
                            <TableCell>
                                {(executingFormIds || []).includes(form.id) ? (
                                    <Button variant="outline" size="sm" disabled>
                                        <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                                        実行中　　　
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleClickExecute(form.id)}>
                                        <PlayIcon className="mr-2 h-4 w-4" />
                                        一度だけ実行
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="ml-2"
                                    onClick={() => handleClickDelete(form.id)}>
                                    <TrashIcon className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default IndexPopup;
