export type DeveloperInput = {
	designGuideline: string;
	assets: {
		icons: Record<string, string>;
		images: Record<string, string>;
		videos: Record<string, string>;
	};
	classManager?: Array<{
		id: number;
		title: string;
		attributes?: Record<string, unknown>;
		parent?: number;
	}>;
};

type Block = {
	name: string;
	attributes: Record<string, unknown>;
	innerBlocks: Block[];
};

export type DeveloperResult = {
	summary: string;
	schema: {
		extensions: Record<string, unknown>;
		blocks: Block[];
	};
};
