// src/kafka-ob1/services/kafka-ob1-processing/createConversationId.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OB1Users } from 'src/entities/ob1-users.entity';
import { OB1Services } from 'src/entities/ob1-services.entity';
import { OB1Conversations } from 'src/entities/ob1-conversations.entity';

@Injectable()
export class CreateConversationService {
    private readonly logger = new Logger(CreateConversationService.name);

    constructor(
        @InjectRepository(OB1Users) private usersRepository: Repository<OB1Users>,
        @InjectRepository(OB1Services) private servicesRepository: Repository<OB1Services>,
        @InjectRepository(OB1Conversations) private conversationsRepository: Repository<OB1Conversations>,
    ) { }

    async createConversationId(functionInput: any, serviceSource: string, userEmail: string) {
        try {
            // Find the user in OB1Users
            const user = await this.usersRepository.findOne({ where: { userEmail: userEmail } });
            if (!user) {
                this.logger.error(`User with email ${userEmail} not found`);
                return { errorMessage: `User with email ${userEmail} not found`, errorCode: 404 };
            }

            // Find the service in OB1Services
            const sourceService = await this.servicesRepository.findOne({ where: { serviceName: serviceSource } });
            if (!sourceService) {
                this.logger.error(`Service with name ${serviceSource} not found`);
                return { errorMessage: `Service with name ${serviceSource} not found`, errorCode: 404 };
            }

            // Create a new conversation record
            const conversation = this.conversationsRepository.create({
                userId: user,
                createdByServiceId: sourceService,
                conversationStatus: 'open', // Default status
            });

            const createdConversation = await this.conversationsRepository.save(conversation);
            this.logger.log(`Created new conversation with ID ${createdConversation.conversationId}`);

            // make a data object
            const responseData = {
                conversationId: createdConversation.conversationId,
                conversationStatus: createdConversation.conversationStatus,
                userId: createdConversation.userId.userId,
                createdByServiceId: createdConversation.createdByServiceId.serviceId,
            }


            return { responseMessage: `Conversation created successfully`, messageContent: responseData, errorCode: 201 };
        } catch (error) {
            this.logger.error(`Error creating conversation: ${error.message}`, error.stack);
            return { errorMessage: 'Failed to create conversation', errorCode: 500 };
        }
    }
}
