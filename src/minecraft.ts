import { destroyRenderer, prepareRenderer, render } from "./render";
import { Jar } from "./utils/jar";
import type { AnimationMeta, BlockModel, Renderer, RendererOptions } from "./utils/types";
//@ts-ignore
import * as deepAssign from 'assign-deep';
import { Logger } from './utils/logger';

export class Minecraft {
  protected jar: Jar
  protected renderer!: Renderer | null;
  protected _cache: { [key: string]: any } = {};

  protected constructor(public file: string | Jar) {
    if (file instanceof Jar) {
      this.jar = file;
    } else {
      this.jar = Jar.open(file);
    }
  }

  static open(file: string | Jar) {
    return new Minecraft(file);
  }

  
  
  async getBlockNameList(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern);
    return (await this.jar.entries('assets/minecraft/models/block'))
      .filter(entry => entry.name.endsWith(".json"))
      .filter(entry => regex.test(entry.name))
      .map(entry => entry.name.slice('assets/minecraft/models/block/'.length, -('.json'.length)));
  }

  async getBlockList(pattern: string): Promise<BlockModel[]> {
    return await Promise.all(
      (await this.getBlockNameList(pattern))
      .map(block => this.getModel(block))
      .map(block => this.loadBaseBlock(block)));
  }

  async loadBaseBlock(block: Promise<BlockModel>): Promise<BlockModel> {
    const model = await block;
    if (model.parents) {
      return deepAssign({}, await this.getModel('block/block'), model);
    }

    return model;
  }

  async getModelFile<T = BlockModel>(name = 'block/block'): Promise<T> {
    if (name.startsWith('minecraft:')) {
      name = name.substring('minecraft:'.length);
    }

    if (name.indexOf('/') == -1) {
      name = `block/${name}`;
    }

    const path = `assets/minecraft/models/${name}.json`;

    try {
      if (this._cache[path]) {
        return JSON.parse(JSON.stringify(this._cache[path]));
      }

      this._cache[path] = await this.jar.readJson(path);

      return this._cache[path];
    } catch (e) {
      throw new Error(`Unable to find model file: ${path}`);
    }
  }

  async getTextureFile(name: string = '') {
    name = name ?? '';
    if (name.startsWith('minecraft:')) {
      name = name.substring('minecraft:'.length);
    }

    const path = `assets/minecraft/textures/${name}.png`;

    try {
      return await this.jar.read(path);
    } catch (e) {
      throw new Error(`Unable to find texture file: ${path}`);
    }
  }


  async getTextureMetadata(name: string = ''): Promise<AnimationMeta | null> {
    name = name ?? '';
    if (name.startsWith('minecraft:')) {
      name = name.substring('minecraft:'.length);
    }

    const path = `assets/minecraft/textures/${name}.png.mcmeta`;

    try {
      return await this.jar.readJson(path);
    } catch (e) {
      return null;
    }
  }

  async *render(blocks: BlockModel[], options?: RendererOptions, rotation?: number[]) {
    try {
      await this.prepareRenderEnvironment(options);

      for (const block of blocks) {
        yield await render(this, block, rotation);
      }
    } finally {
      await this.cleanupRenderEnvironment();
    }
  }

  async getModel(blockName: string): Promise<BlockModel> {
    let { parent, ...model } = await this.getModelFile(blockName);

    if (parent) {
      model = deepAssign({}, await this.getModel(parent), model);

      if (!model.parents) {
        model.parents = [];
      }

      model.parents.push(parent);
    }

    return deepAssign(model, { blockName });
  }

  async close() {
    await this.jar.close();
  }

  async prepareRenderEnvironment(options: RendererOptions = {}) {
    this.renderer = await prepareRenderer(options)
  }

  async cleanupRenderEnvironment() {
    await destroyRenderer(this.renderer!);
    this.renderer = null;
  }

  getRenderer() {
    return this.renderer!;
  }
}