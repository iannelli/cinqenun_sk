import { writable } from 'svelte/store';

export type DrawerInfoState = {
    visible:  boolean;
    titre:    string;
    message:  string;
    largeur:  string;
};

const initialState: DrawerInfoState = {
    visible: false,
    titre:   '',
    message: '',
    largeur: '500px',
};

const { subscribe, update } = writable<DrawerInfoState>(initialState);

export const drawerInfoUtils = {
    subscribe,
    ouvrir(params: Omit<DrawerInfoState, 'visible'>): void {
        update(s => ({ ...s, ...params, visible: true }));
    },
    fermer(): void {
        update(s => ({ ...s, visible: false }));
    },
};