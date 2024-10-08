BRANCH_NAME='main'
ARTIFACTORY_PATH='https://nexus.lemmatechnologies.com/repository/artifacts/lemma-clients'
pipeline {
    
    agent {
        label 'docker-host'
    }
    
    environment {
        GIT_BRANCH = '-'
        GIT_COMMIT = '-'
    }
    
    parameters {
        string(name: 'RELEASE_NUMBER', defaultValue: '', description: 'Enter the release version. e.g. 1.1.1 (<major>.<minor>.<patch>)')
        choice(name: 'BUILD_ENVIRONMENT', choices: ['QA', 'PROD'], description: 'Select the environment for which the artifact is to be generated.')
    }
    
    stages {
        stage('Set Branch') {
            steps {
                script {
                    if (params.RELEASE_NUMBER != '') {
                        BRANCH_NAME= 'release/' + params.RELEASE_NUMBER
                    }
                    echo "Checking out BRANCH : " + BRANCH_NAME
                }
            }
        }

        stage('Checkout Code') {
            steps {
                sshagent(credentials: ['p-git-access']) {
                    script {
                        dir('code') {
                            git branch: BRANCH_NAME, credentialsId: 'p-git-access', url: 'git@github.com:lemmamedia/lemma-signage-client.git'
                        }   
                        dir('code') {
                            GIT_BRANCH = sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()
                            GIT_COMMIT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                        }
                        echo 'Git branch: '+ GIT_BRANCH  
                        echo 'Git commit: '+ GIT_COMMIT 
                    }
                }
            }
        }
        
        stage('Build') {
            agent {
                dockerfile {
                    filename 'Dockerfile'
                    args '-v $WORKSPACE/code:/var/opt'
                    dir './code'
                    reuseNode true
                }
            }
            steps {
                script {
                    if (params.BUILD_ENVIRONMENT == 'PROD') {
                        sh 'cd /var/opt && rm -rf dist && npm install && npm run dist:w'
                    } else {
                        // TODO: Update the cmd for QA environment
                        sh 'cd /var/opt && rm -rf dist && npm install && npm run dist:w'
                    }
                    
                }
            }
        }

        stage('Upload Artifacts') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'nexus-uploader-usr', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                    script {
                        if (params.BUILD_ENVIRONMENT == 'PROD') {
                            sh "curl -v -u ${USERNAME}:${PASSWORD} --upload-file ./code/dist/LemmaApp-*.exe '${ARTIFACTORY_PATH}/prod/lemma-signage-client/${params.RELEASE_NUMBER}/LemmaApp-v${params.RELEASE_NUMBER}-x64.exe'" 
                        } else {
                            sh "curl -v -u ${USERNAME}:${PASSWORD} --upload-file ./code/dist/LemmaApp-*.exe '${ARTIFACTORY_PATH}/qa/lemma-signage-client/${params.RELEASE_NUMBER}/LemmaApp-v${params.RELEASE_NUMBER}-x64.exe'" 
                        }
                    }
                }
            }   
        }
    }
    
     post {
        always {
            archiveArtifacts artifacts: 'code/dist/*.exe', fingerprint: true
        }
     }
}