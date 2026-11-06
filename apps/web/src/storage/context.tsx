import { createContext, useContext } from 'react';
import { IndexedDbProjectStorage } from './projectStorage';
import type { ProjectStorage } from './projectStorage';

export const defaultStorage: ProjectStorage = new IndexedDbProjectStorage();
export const StorageContext = createContext<ProjectStorage>(defaultStorage);
export const useStorage = () => useContext(StorageContext);
