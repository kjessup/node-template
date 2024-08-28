import { ACL } from "../utils/acl.js";
import 'reflect-metadata';
import { Table, Column, generateMetadata } from "crud";
import { PrimaryKey } from "./model-postgres.js";

export interface IModelObject {
    id?: PrimaryKey;
}
/*
@Table('assistants')
export class HelpAssistant implements IModelObject, ACL.IResource {
    @Column()
    public id?: PrimaryKey;
    @Column()
    public assistant_name?: string;
    @Column()
    public assistant_instructions?: string;
    @Column()
    public assistant_external_id?: string;
    @Column()
    public model?: string;
    @Column()
    public resource_key?: string;
}
export const TAssistants = generateMetadata(HelpAssistant);

@Table('assistant_settings')
export class AssistantSetting implements IModelObject {
    @Column()
    public id?: PrimaryKey;
    @Column()
    public assistant_id?: PrimaryKey;
    @Column()
    public setting_key?: string;
    @Column()
    public setting_value?: string;
}
export const TAssistantSettings = generateMetadata(AssistantSetting);
*/

@Table('mime_types')
export class MimeType {
    @Column()
    public id?: PrimaryKey;
    @Column()
    public type?: string;
}
export const TMimeTypes = generateMetadata(MimeType);

@Table('mime_type_extensions')
export class MimeTypeExtensions {
    @Column()
    public type_id?: PrimaryKey;
    @Column()
    public extension?: string;
}
export const TMimeTypeExtensions = generateMetadata(MimeTypeExtensions);
