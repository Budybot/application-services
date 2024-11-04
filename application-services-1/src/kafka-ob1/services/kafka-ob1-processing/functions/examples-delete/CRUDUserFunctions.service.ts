// src/kafka-ob1/services/kafka-ob1-processing/CRUDUserFunctions.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Equal } from 'typeorm';
import { OB1Users } from 'src/entities/ob1-users.entity';
import { OB1Projects } from 'src/entities/ob1-projects.entity';
import { OB1Assets } from 'src/entities/projects/ob1-assets.entity';
import { OB1Instances } from 'src/entities/ob1-instances.entity';
import { OB1PagesFilterPage1 } from 'src/entities/projects/pages/ob1-pages-filterPage1';
import { OB1PagesAssetsPage1 } from 'src/entities/projects/pages/ob1-pages-assetsPage1';
import { OB1PagesInputPage1 } from 'src/entities/projects/pages/ob1-pages-inputPage1';

@Injectable()
export class CRUDUserFunctionsService {
    private readonly logger = new Logger(CRUDUserFunctionsService.name);

    constructor(
        @InjectRepository(OB1Users) private usersRepository: Repository<OB1Users>,
        @InjectRepository(OB1Projects) private projectsRepository: Repository<OB1Projects>,
        @InjectRepository(OB1Assets) private assetsRepository: Repository<OB1Assets>,
        @InjectRepository(OB1Instances) private instancesRepository: Repository<OB1Instances>,
        @InjectRepository(OB1PagesFilterPage1) private pagesFilterPage1Repository: Repository<OB1PagesFilterPage1>,
        @InjectRepository(OB1PagesAssetsPage1) private pagesAssetsPage1Repository: Repository<OB1PagesAssetsPage1>,
        @InjectRepository(OB1PagesInputPage1) private pagesInputPage1Repository: Repository<OB1PagesInputPage1>,
    ) { }

    // Main CRUD function handler
    async handleUserCRUD(functionInput: any, instanceName: string, userEmail: string) {
        try {
            const { CRUDName, CRUDInput } = functionInput;
            const { tableEntity, recordName, projectName } = CRUDInput;
            this.logger.log(`Handling CRUD operation: ${CRUDName} for tableEntity: ${tableEntity} and recordName: ${recordName} & projectName: ${projectName}`);

            // Get user from OB1-users by email
            const user = await this.usersRepository.findOne({ where: { userEmail: userEmail } });
            if (!user) {
                this.logger.error(`User with email ${userEmail} not found`);
                return { errorMessage: `User with email ${userEmail} not found`, errorCode: 404 };
            }

            const instance = await this.instancesRepository.findOne({
                where: { instanceName: instanceName },
            });

            if (!instance) {
                this.logger.error(`Instance with Name ${instanceName} not found`);
                return { errorMessage: `Instance with Name ${instanceName} not found` };
            }

            let project;
            if (projectName && CRUDInput.tableEntity !== 'OB1-projects') {
                project = await this.projectsRepository.findOne({
                    where: {
                        projectName: projectName,
                        instanceId: Equal(instance.instanceId),
                    },
                });
                if (!project) {
                    this.logger.error(`Project ${projectName} not found`);
                    return { errorMessage: `Project ${projectName} not found`, errorCode: 404 };
                }
            }


            // Handle CRUD operations based on CRUDName
            switch (CRUDName) {
                case 'GET':
                    return this.getRecords(tableEntity, recordName, project, instance, user);
                case 'POST':
                    return this.createRecord(tableEntity, CRUDInput, project, instance, user);
                case 'DELETE':
                    return this.deleteRecord(tableEntity, CRUDInput, project, instance, user);
                default:
                    this.logger.error(`Invalid CRUD operation: ${CRUDName}`);
                    return { errorMessage: `Invalid CRUD operation: ${CRUDName}`, errorCode: 400 };
            }
        } catch (error) {
            this.logger.error(`Error in handleCRUD: ${error.message}`, error.stack);
            return { errorMessage: 'Failed to perform CRUD operation', errorCode: 500 };
        }
    }

    // Retrieve records
    async getRecords(tableEntity: string, recordName: string, project: OB1Projects, instance: OB1Instances, user: OB1Users) {
        let result;

        switch (tableEntity) {

            case 'OB1-projects':
                if (recordName) {
                    result = await this.projectsRepository.findOne({
                        where: {
                            projectName: recordName,
                            instanceId: Equal(instance.instanceId),
                            creatorUserId: Equal(user.userId),
                        },
                    });
                } else {
                    result = await this.projectsRepository.find({ where: { instanceId: Equal(instance.instanceId), creatorUserId: Equal(user.userId) } });
                }
                break;

            case 'OB1-assets':
                if (recordName) {
                    if (!project) {
                        this.logger.error(`Project not found`);
                        return { errorMessage: `Project not found`, errorCode: 404 };
                    }
                    result = await this.assetsRepository.findOne({
                        where: {
                            assetName: recordName,
                            projectId: Equal(project.projectId),
                            userId: Equal(user.userId),
                        },
                    });
                } else {
                    result = await this.assetsRepository.find({ where: { projectId: Equal(project.projectId), userId: Equal(user.userId) } });
                }
                break;

            case 'OB1-pages-filterPage1':
                if (recordName) {
                    if (!project) {
                        this.logger.error(`Project not found`);
                        return { errorMessage: `Project not found`, errorCode: 404 };
                    }
                    result = await this.pagesFilterPage1Repository.findOne({
                        where: {
                            projectId: Equal(project.projectId),
                        },
                    });
                } else {
                    result = await this.pagesFilterPage1Repository.find({ where: { projectId: Equal(project.projectId) } });
                }
                break;

            case 'OB1-pages-assetsPage1':
                if (recordName) {
                    if (!project) {
                        this.logger.error(`Project not found`);
                        return { errorMessage: `Project not found`, errorCode: 404 };
                    }
                    result = await this.pagesAssetsPage1Repository.findOne({
                        where: {
                            projectId: Equal(project.projectId),
                        },
                    });
                } else {
                    result = await this.pagesAssetsPage1Repository.find({
                        where: {
                            projectId: Equal(project.projectId)
                        }
                    });
                }
                break;
            case 'OB1-pages-inputPage1':
                if (recordName) {
                    if (!project) {
                        this.logger.error(`Project not found`);
                        return { errorMessage: `Project not found`, errorCode: 404 };
                    }
                    result = await this.pagesInputPage1Repository.findOne({
                        where: {
                            projectId: Equal(project.projectId),
                        },
                    });
                } else {
                    result = await this.pagesInputPage1Repository.find({ where: { projectId: Equal(project.projectId) } });
                }
                break;
            default:
                this.logger.error(`Unknown table entity: ${tableEntity}`);
                return { errorMessage: `Unknown table entity: ${tableEntity}`, errorCode: 404 };
        }

        if (!result) {
            this.logger.log(`No records found for ${tableEntity} with recordName: ${recordName}`);
            return { errorMessage: `No records found`, errorCode: 404 };
        }

        this.logger.log(`Fetched records from ${tableEntity} for user ${user.userEmail}`);
        return { responseMessage: `GET request successful`, messageContent: result, errorCode: 200 };
    }

    // Create or update a record
    async createRecord(tableEntity: string, CRUDInput: any, project: OB1Projects, instance: OB1Instances, user: OB1Users) {
        let result;

        switch (tableEntity) {

            case 'OB1-projects':
                if (!CRUDInput.projectName) {
                    this.logger.error(`projectName not provided`);
                    return { errorMessage: `projectName not provided`, errorCode: 400 };
                }
                result = await this.handleProjectUpsert(CRUDInput, instance, user);
                break;

            case 'OB1-assets':
                if (!project) {
                    this.logger.error(`Project not found`);
                    return { errorMessage: `Project not found`, errorCode: 404 };
                }
                result = await this.handleAssetUpsert(CRUDInput, project, user);
                break;
            case 'OB1-pages-filterPage1':
                if (!project) {
                    this.logger.error(`Project not found`);
                    return { errorMessage: `Project not found`, errorCode: 404 };
                }
                result = await this.handlePageFilterPage1Upsert(CRUDInput, project);
                break;
            case 'OB1-pages-assetsPage1':
                if (!project) {
                    this.logger.error(`Project not found`);
                    return { errorMessage: `Project not found`, errorCode: 404 };
                }
                result = await this.handlePageAssetsPage1Upsert(CRUDInput, project);
                break;
            case 'OB1-pages-inputPage1':
                if (!project) {
                    this.logger.error(`Project not found`);
                    return { errorMessage: `Project not found`, errorCode: 404 };
                }
                result = await this.handlePageInputPage1Upsert(CRUDInput, project);
                break;
            default:
                this.logger.error(`Unknown table entity: ${tableEntity}`);
                return { errorMessage: `Unknown table entity: ${tableEntity}`, errorCode: 404 };
        }

        this.logger.log(`Created or updated record in ${tableEntity} for user ${user.userEmail}`);
        return { responseMessage: `POST request successful`, messageContent: result, errorCode: 201 };
    }

    // Delete a record
    async deleteRecord(tableEntity: string, CRUDInput: any, project: OB1Projects, instance: OB1Instances, user: OB1Users) {
        let result;

        switch (tableEntity) {


            case 'OB1-projects':
                const project = await this.projectsRepository.findOne({
                    where: { projectName: CRUDInput.projectName, instanceId: Equal(instance.instanceId), creatorUserId: Equal(user.userId) },
                });
                if (project) result = await this.projectsRepository.delete(project.projectId);
                break;

            case 'OB1-assets':
                if (!project) {
                    this.logger.error(`Project not found`);
                    return { errorMessage: `Project not found`, errorCode: 404 };
                }
                const asset = await this.assetsRepository.findOne({
                    where: { assetName: CRUDInput.assetName, projectId: Equal(project.projectId), userId: Equal(user.userId) },
                });
                if (asset) result = await this.assetsRepository.delete(asset.assetId);
                break;

            default:
                this.logger.error(`Unknown table entity: ${tableEntity}`);
                return { errorMessage: `Unknown table entity: ${tableEntity} for CRUDUserFunctions`, errorCode: 404 };
        }

        this.logger.log(`Deleted record in ${tableEntity} for user ${user.userEmail}`);
        return { responseMessage: `DELETE request successful`, messageContent: result, errorCode: 200 };
    }


    // Helper function to handle project upsert
    private async handleProjectUpsert(CRUDInput: any, instance: OB1Instances, user: OB1Users) {
        const existingProject = await this.projectsRepository.findOne({
            where: { projectName: CRUDInput.projectName, instanceId: Equal(instance.instanceId), creatorUserId: Equal(user.userId) },
        });
        return existingProject
            ? this.projectsRepository.save({ ...existingProject, ...CRUDInput })
            : this.projectsRepository.save(
                this.projectsRepository.create({
                    ...CRUDInput,
                    instanceId: instance,
                    creatorUserId: user,
                }),
            );
    }

    // Helper function to handle asset upsert
    private async handleAssetUpsert(CRUDInput: any, project: OB1Projects, user: OB1Users) {
        const existingAsset = await this.assetsRepository.findOne({
            where: { assetName: CRUDInput.assetName, projectId: Equal(project.projectId), userId: Equal(user.userId) },
        });
        return existingAsset
            ? this.assetsRepository.save({ ...existingAsset, ...CRUDInput })
            : this.assetsRepository.save(
                this.assetsRepository.create({
                    ...CRUDInput,
                    userId: user,
                    projectId: project,
                }),
            );
    }
    // Helper function to handle pageFilterPage1 upsert
    private async handlePageFilterPage1Upsert(CRUDInput: any, project: OB1Projects) {
        const existingPage = await this.pagesFilterPage1Repository.findOne({
            where: { projectId: Equal(project.projectId) },
        });
        return existingPage
            ? this.pagesFilterPage1Repository.save({ ...existingPage, ...CRUDInput })
            : this.pagesFilterPage1Repository.save(
                this.pagesFilterPage1Repository.create({
                    ...CRUDInput,
                    projectId: project,
                }),
            );
    }
    // Helper function to handle pageAssetsPage1 upsert
    private async handlePageAssetsPage1Upsert(CRUDInput: any, project: OB1Projects) {
        const existingPage = await this.pagesAssetsPage1Repository.findOne({
            where: { projectId: Equal(project.projectId) },
        });
        return existingPage
            ? this.pagesAssetsPage1Repository.save({ ...existingPage, ...CRUDInput })
            : this.pagesAssetsPage1Repository.save(
                this.pagesAssetsPage1Repository.create({
                    ...CRUDInput,
                    projectId: project,
                }),
            );
    }
    // Helper function to handle pageInputPage1 upsert
    private async handlePageInputPage1Upsert(CRUDInput: any, project: OB1Projects) {
        const existingPage = await this.pagesInputPage1Repository.findOne({
            where: { projectId: Equal(project.projectId) },
        });
        return existingPage
            ? this.pagesInputPage1Repository.save({ ...existingPage, ...CRUDInput })
            : this.pagesInputPage1Repository.save(
                this.pagesInputPage1Repository.create({
                    ...CRUDInput,
                    projectId: project,
                }),
            );
    }
}
